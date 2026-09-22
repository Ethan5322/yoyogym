// Connecting a request to its gym — the third branch of the architecture.
//
//   Many separate gym tenants
//     Gym 1 -> existing Yoyo Gym system
//     Gym 2 -> existing Yoyo Gym system
//     10,000+ gyms, each connected separately
//
// resolveGym() and runWithGym() were built and tested long before this file,
// and nothing ever called them. This is what calls them.
//
// TWO THINGS THESE TESTS DEFEND, in order of consequence:
//
//   1. A request with no gym information behaves EXACTLY as it does today.
//      Every existing deployment keeps working; nobody is logged out.
//
//   2. A member of gym A can never reach gym B. Under D-096 all gyms share one
//      JWT_SECRET, so a token from A verifies at B — which means the gym must
//      come from the SIGNED token, not from anything the client can retype.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET ||= 'test-only-gym-secret';

const { gymForRequest, GymContextError } = await import('../server/lib/gymcontext.js');
const { signToken } = await import('../server/lib/auth.js');
const { signMemberToken } = await import('../server/lib/memberauth.js');

const req = ({ headers = {}, url = '/api/admin/members' } = {}) => ({ headers, url });

// ---------------------------------------------------------------------------
// 1. Nothing changes for a single-gym deployment
// ---------------------------------------------------------------------------

test('a request with no gym information stays in single-gym mode', () => {
  // The existing deployment sends no gym anything. It must behave exactly as
  // it always has — which means this returns null, and getSupabase() falls
  // through to the environment.
  assert.equal(gymForRequest(req()), null);
});

test('an existing token with no gym claim stays in single-gym mode', () => {
  // Every admin token in the wild today has no gym claim. If this treated
  // that as an error, every signed-in staff member would be locked out.
  const token = signToken({ id: 'a1', username: 'ann', role: 'owner' });
  assert.equal(gymForRequest(req({ headers: { authorization: `Bearer ${token}` } })), null);
});

// ---------------------------------------------------------------------------
// 2. The gym comes from the token
// ---------------------------------------------------------------------------

test('an admin token carrying a gym resolves to that gym', () => {
  const token = signToken({ id: 'a1', username: 'ann', role: 'owner' }, { gym: 'bos-gym' });
  assert.equal(gymForRequest(req({ headers: { authorization: `Bearer ${token}` } })), 'bos-gym');
});

test('a member token carrying a gym resolves to that gym', () => {
  const token = signMemberToken({ id: 'm1', membership_number: 'GYM-2026-1' }, { gym: 'bos-gym' });
  assert.equal(
    gymForRequest(req({ headers: { authorization: `Bearer ${token}` }, url: '/api/member/me' })),
    'bos-gym'
  );
});

// ---------------------------------------------------------------------------
// 3. The header cannot override the token
// ---------------------------------------------------------------------------

test('A HEADER THAT CONTRADICTS THE TOKEN IS REFUSED', () => {
  // The whole reason the gym lives in the token. All gyms share one
  // JWT_SECRET (D-096), so a token from gym A verifies at gym B. If a header
  // could pick the gym, a member of A would simply type B and be inside it.
  const token = signToken({ id: 'a1', username: 'ann', role: 'owner' }, { gym: 'bos-gym' });

  assert.throws(
    () =>
      gymForRequest(
        req({ headers: { authorization: `Bearer ${token}`, 'x-gym-slug': 'rival-gym' } })
      ),
    (err) => err instanceof GymContextError && err.status === 403,
    'a mismatch must be refused, not silently resolved either way'
  );
});

test('a header that AGREES with the token is fine', () => {
  // The app does send it, for clarity in logs. Agreement is not a conflict.
  const token = signToken({ id: 'a1', username: 'ann', role: 'owner' }, { gym: 'bos-gym' });

  assert.equal(
    gymForRequest(req({ headers: { authorization: `Bearer ${token}`, 'x-gym-slug': 'bos-gym' } })),
    'bos-gym'
  );
});

// ---------------------------------------------------------------------------
// 4. Public requests have no token, and that is allowed
// ---------------------------------------------------------------------------

test('a public request takes the gym from the header', () => {
  // Registration and the gym profile happen before anyone has a token. These
  // expose nothing private, and they are gym-scoped by nature.
  assert.equal(
    gymForRequest(req({ headers: { 'x-gym-slug': 'bos-gym' }, url: '/api/register' })),
    'bos-gym'
  );
});

test('a malformed slug is refused rather than passed to the resolver', () => {
  for (const bad of ['../../etc', 'BOS GYM', 'gym;drop', 'a'.repeat(100)]) {
    assert.throws(
      () => gymForRequest(req({ headers: { 'x-gym-slug': bad }, url: '/api/register' })),
      (err) => err instanceof GymContextError && err.status === 400,
      `"${bad}" should be refused`
    );
  }
});

test('an empty header is treated as absent, not as a gym called ""', () => {
  assert.equal(gymForRequest(req({ headers: { 'x-gym-slug': '   ' }, url: '/api/register' })), null);
});

// ---------------------------------------------------------------------------
// 5. A forged or unreadable token
// ---------------------------------------------------------------------------

test('an unreadable token contributes no gym, rather than trusting the header', () => {
  // Falling back to the header here would be a way to bypass the token check
  // entirely: send rubbish in Authorization, send the gym you want in a header.
  assert.throws(
    () =>
      gymForRequest(
        req({ headers: { authorization: 'Bearer nonsense', 'x-gym-slug': 'rival-gym' } })
      ),
    (err) => err instanceof GymContextError && err.status === 401
  );
});

test('a token signed with the wrong key is refused', () => {
  const forged = jwt.sign({ sub: 'a1', role: 'owner', gym: 'rival-gym' }, 'wrong-key', {
    expiresIn: '1h',
  });

  assert.throws(
    () => gymForRequest(req({ headers: { authorization: `Bearer ${forged}` } })),
    (err) => err instanceof GymContextError && err.status === 401
  );
});
