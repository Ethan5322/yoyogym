// F-1 — a token issued for one surface must not work on another.
//
// APPROVED BY THE USER 2026-09-22. This touches protected surface
// (CLAUDE.md §32, "existing authentication model"), so the first two tests are
// about what must NOT change: every admin session that exists right now keeps
// working, because those tokens carry no `aud` claim at all.
//
// The defect: server/lib/auth.js called jwt.verify(token, JWT_SECRET) with no
// audience option, while server/lib/memberauth.js signs member tokens with the
// SAME secret and sets aud:'member'. The claim was written and never read, so
// a member token was a structurally valid admin token.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET ||= 'test-only-gym-secret';

const { verifyToken, signToken } = await import('../server/lib/auth.js');
const { signMemberToken } = await import('../server/lib/memberauth.js');

const SECRET = process.env.JWT_SECRET;

// ---------------------------------------------------------------------------
// What must NOT change
// ---------------------------------------------------------------------------

test('an admin token issued by this build still verifies', () => {
  const token = signToken({ id: 'a1', username: 'ann', role: 'owner', full_name: 'Ann' });
  const payload = verifyToken(token);

  assert.equal(payload.sub, 'a1');
  assert.equal(payload.role, 'owner');
});

test('AN EXISTING LIVE SESSION IS NOT LOGGED OUT', () => {
  // Admin tokens in the wild carry no `aud`. If the fix required one, every
  // signed-in staff member would be kicked out the moment this deploys, in the
  // middle of a working day.
  const legacy = jwt.sign(
    { sub: 'a1', username: 'ann', role: 'owner', full_name: 'Ann' },
    SECRET,
    { expiresIn: '8h' }
  );

  assert.ok(verifyToken(legacy), 'a token with no audience claim must still pass');
  assert.equal(verifyToken(legacy).role, 'owner');
});

// ---------------------------------------------------------------------------
// What must change
// ---------------------------------------------------------------------------

test('A MEMBER TOKEN IS NO LONGER A VALID ADMIN TOKEN', () => {
  // This is the whole finding. It returned a payload before today.
  const memberToken = signMemberToken({ id: 'm1', membership_number: 'GYM-2026-000123' });

  assert.equal(verifyToken(memberToken), null);
});

test('a platform token is not a valid admin token either', () => {
  const platformToken = jwt.sign(
    { sub: 's1', email: 'staff@yoyogyms.com', kind: 'platform_staff' },
    SECRET,
    { expiresIn: '8h', audience: 'platform' }
  );

  assert.equal(verifyToken(platformToken), null);
});

test('a token with an invented audience is refused, not guessed at', () => {
  const odd = jwt.sign({ sub: 'x', role: 'owner' }, SECRET, { expiresIn: '1h', audience: 'whatever' });
  assert.equal(verifyToken(odd), null);
});

// ---------------------------------------------------------------------------
// Unchanged behaviour
// ---------------------------------------------------------------------------

test('a token signed with the wrong key is still refused', () => {
  const forged = jwt.sign({ sub: 'a1', role: 'owner' }, 'not-the-secret', { expiresIn: '8h' });
  assert.equal(verifyToken(forged), null);
});

test('an expired admin token is still refused', () => {
  const stale = jwt.sign({ sub: 'a1', role: 'owner' }, SECRET, { expiresIn: '-1h' });
  assert.equal(verifyToken(stale), null);
});

test('rubbish is refused without throwing', () => {
  assert.equal(verifyToken('not-a-token'), null);
  assert.equal(verifyToken(''), null);
  assert.equal(verifyToken(null), null);
});
