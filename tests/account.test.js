// Regenerating recovery codes.
//
// They are issued once and stored as hashes, so nobody can show them to you
// again. That is correct, and it is a trap if you did not write them down: the
// platform owner is the only account that reaches every gym, and there is no
// second owner to let you back in.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { regenerateRecoveryCodes, remainingCodes } from '../platform/account.js';

const USER = {
  id: 'u1',
  email: 'me@yoyogyms.com',
  password_hash: '$2b$12$hash',
  totp_enabled: true,
  recovery_code_hashes: ['a', 'b', 'c'],
};

function deps(over = {}) {
  const calls = { saved: [], audits: [] };
  return {
    calls,
    verifyPassword: async (plain) => plain === 'correct-horse',
    verifySecondFactor: async (_u, code) => code === '123456',
    saveRecoveryCodes: async (id, hashes) => { calls.saved.push({ id, hashes }); },
    audit: async (a) => { calls.audits.push(a); },
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Re-authentication
// ---------------------------------------------------------------------------

test('A SIGNED-IN SESSION IS NOT ENOUGH — the password is asked for again', async () => {
  // Recovery codes bypass 2FA by design. Minting a set from a stolen session
  // would hand somebody a permanent way back in that survives changing the
  // password AND redoing two-factor.
  const d = deps();
  const result = await regenerateRecoveryCodes(d, { user: USER, password: 'wrong', totp: '123456' });

  assert.equal(result.ok, false);
  assert.equal(d.calls.saved.length, 0, 'nothing is issued');
});

test('the authenticator is required too', async () => {
  const d = deps();
  const result = await regenerateRecoveryCodes(d, { user: USER, password: 'correct-horse', totp: '000000' });

  assert.equal(result.ok, false);
  assert.equal(d.calls.saved.length, 0);
});

test('one message for either failure', async () => {
  // Saying which half was wrong tells an attacker which half to work on.
  const d = deps();
  const badPassword = await regenerateRecoveryCodes(d, { user: USER, password: 'x', totp: '123456' });
  const badCode = await regenerateRecoveryCodes(d, { user: USER, password: 'correct-horse', totp: '0' });

  assert.equal(badPassword.reason, badCode.reason);
});

test('a refused attempt is audited — this is not ordinary activity', async () => {
  const d = deps();
  await regenerateRecoveryCodes(d, { user: USER, password: 'wrong', totp: 'wrong' });

  assert.ok(d.calls.audits.some((a) => a.action === 'platform.recovery_codes.refused'));
});

// ---------------------------------------------------------------------------
// Succeeding
// ---------------------------------------------------------------------------

test('both factors correct issues a fresh set, shown once', async () => {
  const d = deps();
  const result = await regenerateRecoveryCodes(d, { user: USER, password: 'correct-horse', totp: '123456' });

  assert.equal(result.ok, true);
  assert.ok(result.codes.length > 0);
  assert.equal(d.calls.saved.length, 1);
});

test('THE OLD CODES STOP WORKING — hashes are replaced, not appended', async () => {
  // If the reason for doing this is that the old list went missing, leaving it
  // valid would defeat the entire exercise.
  const d = deps();
  await regenerateRecoveryCodes(d, { user: USER, password: 'correct-horse', totp: '123456' });

  const saved = d.calls.saved[0].hashes;
  for (const old of USER.recovery_code_hashes) {
    assert.ok(!saved.includes(old), `the old hash ${old} must not survive`);
  }
});

test('only hashes are stored — never a code', async () => {
  const d = deps();
  const result = await regenerateRecoveryCodes(d, { user: USER, password: 'correct-horse', totp: '123456' });

  const saved = JSON.stringify(d.calls.saved[0].hashes);
  for (const code of result.codes) {
    assert.ok(!saved.includes(code), 'a raw code must never reach the database');
  }
});

test('the audit entry carries no code and no hash', async () => {
  const d = deps();
  const result = await regenerateRecoveryCodes(d, { user: USER, password: 'correct-horse', totp: '123456' });

  const entry = d.calls.audits.find((a) => a.action === 'platform.recovery_codes.regenerated');
  const text = JSON.stringify(entry);
  for (const code of result.codes) assert.ok(!text.includes(code));
  assert.equal(entry.detail.count, result.codes.length);
});

// ---------------------------------------------------------------------------
// How many are left
// ---------------------------------------------------------------------------

test('the account screen can say how many remain', () => {
  assert.equal(remainingCodes(USER), 3);
  assert.equal(remainingCodes({ recovery_code_hashes: [] }), 0);
  assert.equal(remainingCodes({}), 0);
  assert.equal(remainingCodes(null), 0);
});
