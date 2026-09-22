// First run — claiming the seeded owner account.
//
// The seed creates the platform owner with no password and no 2FA, because a
// password typed into a SQL editor ends up in the clipboard, the query history
// and probably a screenshot. This is where it is set properly.
//
// The tests that matter are the ones about what this must REFUSE, because a
// first-run route that stays open is a permanent password reset for anyone who
// finds it.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.PLATFORM_SETUP_TOKEN = 'setup-token-for-tests';

import { setupAllowed, beginSetup, completeSetup, MIN_PASSWORD_LENGTH } from '../platform/setup.js';
import { totpCode, base32Decode } from '../platform/auth.js';

const FRESH = { id: 'u1', email: 'me@yoyogyms.com', kind: 'platform_staff', password_hash: null };
const CLAIMED = { ...FRESH, password_hash: '$2b$12$alreadyset' };

function deps() {
  const calls = { finished: [], audits: [] };
  return {
    calls,
    finishSetup: async (id, patch) => { calls.finished.push({ id, ...patch }); },
    audit: async (a) => { calls.audits.push(a); },
  };
}

// ---------------------------------------------------------------------------
// The token
// ---------------------------------------------------------------------------

test('no token configured means the route does not work at all', () => {
  const saved = process.env.PLATFORM_SETUP_TOKEN;
  delete process.env.PLATFORM_SETUP_TOKEN;
  try {
    assert.equal(setupAllowed('anything').ok, false);
  } finally {
    process.env.PLATFORM_SETUP_TOKEN = saved;
  }
});

test('a wrong token is refused', () => {
  assert.equal(setupAllowed('not-the-token').ok, false);
  assert.equal(setupAllowed('').ok, false);
  assert.equal(setupAllowed(undefined).ok, false);
});

test('the right token is accepted', () => {
  assert.equal(setupAllowed('setup-token-for-tests').ok, true);
});

// ---------------------------------------------------------------------------
// The one-time guard — the important one
// ---------------------------------------------------------------------------

test('AN ACCOUNT THAT ALREADY HAS A PASSWORD CANNOT BE SET UP AGAIN', () => {
  // This is what makes setup a one-time act rather than a permanent password
  // reset for anybody holding the token. The route closes behind itself.
  const result = beginSetup(CLAIMED);

  assert.equal(result.ok, false);
  assert.match(result.reason, /already set up/i);
});

test('a completed setup cannot be replayed, even with the token and a valid code', async () => {
  const d = deps();
  const result = await completeSetup(d, {
    user: CLAIMED,
    secret: 'JBSWY3DPEHPK3PXP',
    password: 'a-long-enough-password',
    totp: '000000',
  });

  assert.equal(result.ok, false);
  assert.equal(d.calls.finished.length, 0, 'nothing is written');
});

test('a gym owner cannot use the staff setup route', () => {
  // Owners are set up by their activation link, which is tied to their gym.
  assert.equal(beginSetup({ ...FRESH, kind: 'gym_owner' }).ok, false);
});

// ---------------------------------------------------------------------------
// Starting
// ---------------------------------------------------------------------------

test('beginning setup mints a 2FA secret and something to scan', () => {
  const result = beginSetup(FRESH);

  assert.equal(result.ok, true);
  assert.match(result.secret, /^[A-Z2-7]+$/, 'base32, as an authenticator expects');
  assert.match(result.otpauth, /^otpauth:\/\/totp\//);
  assert.match(result.otpauth, /me%40yoyogyms\.com/, 'the account is named in the app');
});

test('two attempts never mint the same secret', () => {
  assert.notEqual(beginSetup(FRESH).secret, beginSetup(FRESH).secret);
});

// ---------------------------------------------------------------------------
// Finishing
// ---------------------------------------------------------------------------

const valid = (secret) => totpCode(base32Decode(secret));

test('a correct code sets the password, enables 2FA, and returns recovery codes ONCE', async () => {
  const d = deps();
  const { secret } = beginSetup(FRESH);

  const result = await completeSetup(d, {
    user: FRESH, secret, password: 'a-long-enough-password', totp: valid(secret),
  });

  assert.equal(result.ok, true);
  assert.ok(result.recoveryCodes.length > 0, 'shown once, stored only as hashes');

  const written = d.calls.finished[0];
  assert.ok(written.password_hash.startsWith('$2'), 'bcrypt, never plaintext');
  assert.equal(written.totp_enabled, true);
  assert.ok(Array.isArray(written.recovery_code_hashes));
  assert.ok(!JSON.stringify(written).includes(result.recoveryCodes[0]), 'raw codes are never stored');
});

test('THE AUTHENTICATOR IS PROVEN BEFORE 2FA IS TURNED ON', async () => {
  // Enabling two-factor without checking the app works would lock the only
  // owner account out of the platform on its first day, with no second
  // account to fix it from.
  const d = deps();
  const { secret } = beginSetup(FRESH);

  const result = await completeSetup(d, {
    user: FRESH, secret, password: 'a-long-enough-password', totp: '000000',
  });

  assert.equal(result.ok, false);
  assert.match(result.reason, /did not match/i);
  assert.equal(d.calls.finished.length, 0, 'nothing is written, so nothing is locked');
});

test('a short password is refused before anything is written', async () => {
  const d = deps();
  const { secret } = beginSetup(FRESH);

  const result = await completeSetup(d, {
    user: FRESH, secret, password: 'short', totp: valid(secret),
  });

  assert.equal(result.ok, false);
  assert.match(result.reason, new RegExp(String(MIN_PASSWORD_LENGTH)));
  assert.equal(d.calls.finished.length, 0);
});

test('setup is written to the audit log, without the secret', async () => {
  const d = deps();
  const { secret } = beginSetup(FRESH);

  await completeSetup(d, { user: FRESH, secret, password: 'a-long-enough-password', totp: valid(secret) });

  const entry = d.calls.audits.find((a) => a.action === 'platform.owner.setup_completed');
  assert.ok(entry);
  assert.ok(!JSON.stringify(entry).includes(secret), 'the log is readable in the panel');
});
