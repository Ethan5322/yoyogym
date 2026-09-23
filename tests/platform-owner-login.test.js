// Gym owners signing in.
//
// The login route required a second factor from everyone. That is correct for
// platform staff — one staff account reaches every gym on the platform (D-077)
// — and it locked out every gym owner, because an owner's account is created
// by the signup form and never has TOTP set up.
//
// So the rule is not "2FA or not". It is: the account that can reach every gym
// must have it; the account that can reach one gym may.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.PLATFORM_JWT_SECRET ||= 'test-only-signing-key-not-used-anywhere';

import { handlePlatform } from '../platform/router.js';

function req({ method = 'POST', url = '/platform/login', body = '' } = {}) {
  const r = { method, url, headers: { 'content-type': 'application/x-www-form-urlencoded' }, _body: body };
  r[Symbol.asyncIterator] = async function* () { if (r._body) yield Buffer.from(r._body); };
  return r;
}

function res() {
  return {
    statusCode: 200, headers: {}, body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    getHeader(k) { return this.headers[k.toLowerCase()]; },
    writeHead(code, h) {
      this.statusCode = code;
      for (const [k, v] of Object.entries(h || {})) this.headers[k.toLowerCase()] = v;
      return this;
    },
    end(b) { this.body = b || ''; this.ended = true; return this; },
  };
}

const deps = (user) => ({
  findUserByEmail: async () => user,
  verifyPassword: async (plain) => plain === 'correct-horse',
  verifySecondFactor: async (u, code) => Boolean(u?.totp_enabled) && code === '123456',
  audit: async () => {},
});

const OWNER = { id: 'o1', email: 'ann@bos.co', password_hash: 'h', kind: 'gym_owner', totp_enabled: false };
const STAFF = { id: 's1', email: 'me@yoyogyms.com', password_hash: 'h', kind: 'platform_staff', totp_enabled: false };

const login = (email, password, totp = '') =>
  req({ body: `email=${encodeURIComponent(email)}&password=${password}&totp=${totp}` });

// ---------------------------------------------------------------------------
// Owners
// ---------------------------------------------------------------------------

test('a gym owner signs in with a password alone', async () => {
  const r = res();
  await handlePlatform(login('ann@bos.co', 'correct-horse'), r, deps(OWNER));

  assert.equal(r.statusCode, 302);
  assert.match(String(r.getHeader('set-cookie')), /HttpOnly/i);
});

test('an owner who HAS set up 2FA must still use it', async () => {
  // Opting in must not be a setting that does nothing.
  const r = res();
  await handlePlatform(
    login('ann@bos.co', 'correct-horse', '000000'),
    r,
    deps({ ...OWNER, totp_enabled: true })
  );

  assert.ok(!r.getHeader('set-cookie'));
  assert.match(r.body, /Invalid/i);
});

test('an owner with the wrong password is still refused', async () => {
  const r = res();
  await handlePlatform(login('ann@bos.co', 'wrong'), r, deps(OWNER));

  assert.ok(!r.getHeader('set-cookie'));
});

test('an owner lands on their own gym, not the staff review queue', async () => {
  const r = res();
  await handlePlatform(login('ann@bos.co', 'correct-horse'), r, deps(OWNER));

  assert.equal(r.headers.location, '/platform/my-gym');
});

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

test('PLATFORM STAFF WITHOUT 2FA CANNOT SIGN IN, password or not', async () => {
  // The account that reaches every gym on the platform. A correct password
  // alone must never be enough, and an admin who has not finished setting up
  // 2FA is not a reason to make an exception — it is the reason for the rule.
  const r = res();
  await handlePlatform(login('me@yoyogyms.com', 'correct-horse'), r, deps(STAFF));

  assert.ok(!r.getHeader('set-cookie'), 'no session for a staff account without 2FA');
  assert.match(r.body, /two-factor|2FA|authenticator/i, 'and it says what to do about it');
});

test('platform staff with 2FA sign in as before', async () => {
  const r = res();
  await handlePlatform(
    login('me@yoyogyms.com', 'correct-horse', '123456'),
    r,
    deps({ ...STAFF, totp_enabled: true })
  );

  assert.equal(r.statusCode, 302);
  // Staff land on the front page, not on one list (D-154).
  assert.equal(r.headers.location, '/platform/home');
});

test('an unknown kind is treated as staff, so a bad row cannot create a weak account', async () => {
  const r = res();
  await handlePlatform(
    login('x@y.z', 'correct-horse'),
    r,
    deps({ id: 'x', email: 'x@y.z', password_hash: 'h', kind: 'something_new', totp_enabled: false })
  );

  assert.ok(!r.getHeader('set-cookie'), 'fails closed');
});
