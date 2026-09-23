// The owner getting into their own gym.
//
// Onboarding used to finish with an owner who had a platform login, a
// provisioned gym schema, and NO ACCOUNT INSIDE IT. The gym admin panel had
// nothing to sign into, and the only way to make an account was a script run
// by hand on somebody's laptop against one .env file.
//
// These tests are about the moment that gap is closed, and about the ordering
// that keeps an owner from being stranded if it fails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';

import { gymOwnerAccount, gymAdminPath, OWNER_USERNAME } from '../platform/gym-admin.js';
import { issueActivation, completeActivation } from '../platform/activation.js';

const NOW = new Date('2026-09-23T10:00:00Z');
const PASSWORD = 'a-password-they-chose';

function setup(over = {}) {
  const { row, token, code } = issueActivation({ userId: 'u1', gymId: 'g1', now: NOW });
  const calls = { seeded: [], passwords: [], used: [], statuses: [], audits: [] };

  const deps = {
    findActivation: async () => ({ ...row, id: 'act-1' }),
    createGymAdmin: async (args) => { calls.seeded.push(args); return true; },
    setPassword: async (id, hash) => { calls.passwords.push({ id, hash }); },
    markUsed: async (id, at) => { calls.used.push({ id, at }); },
    setGymStatus: async (id, s) => { calls.statuses.push({ id, s }); },
    audit: async (a) => { calls.audits.push(a); },
    ...over,
  };

  return { deps, calls, token, code };
}

// ---------------------------------------------------------------------------
// The account itself
// ---------------------------------------------------------------------------

test('THE OWNER GETS AN ACCOUNT IN THEIR OWN GYM', async () => {
  const { deps, calls, token, code } = setup();
  const result = await completeActivation(deps, { token, code, password: PASSWORD }, { now: NOW });

  assert.equal(result.ok, true);
  assert.equal(result.gymAdminCreated, true);
  assert.equal(calls.seeded.length, 1);
  assert.equal(calls.seeded[0].gymId, 'g1');
  assert.equal(calls.seeded[0].userId, 'u1');
});

test('the account has the owner role, or it unlocks nothing', async () => {
  // `owner` is what gates Settings and Staff in the existing panel (CLAUDE.md
  // section 8). A `manager` account could not add their own reception staff.
  const account = await gymOwnerAccount({ email: 'ann@bos.co', fullName: 'Ann', password: PASSWORD });

  assert.equal(account.role, 'owner');
  assert.equal(account.is_active, true);
  assert.equal(account.username, OWNER_USERNAME);
});

test('THE PASSWORD IS HASHED, WITH THE GYM OWN HASH', async () => {
  // Not the platform hash copied across. The two stores are separate, and a
  // hash shared between them is a link between them.
  const account = await gymOwnerAccount({ email: 'ann@bos.co', fullName: 'Ann', password: PASSWORD });

  assert.ok(!account.password, 'the plaintext is never part of the row');
  assert.match(account.password_hash, /^\$2[aby]\$/, 'bcrypt, same as every other gym account');
  assert.ok(await bcrypt.compare(PASSWORD, account.password_hash), 'and it verifies');
});

test('an account cannot be built without a password', async () => {
  await assert.rejects(() => gymOwnerAccount({ email: 'a@b.co' }), /password is required/i);
});

test('the email is normalised and a missing name does not produce "null"', async () => {
  const account = await gymOwnerAccount({ email: '  ANN@BOS.CO ', fullName: '  ', password: PASSWORD });

  assert.equal(account.email, 'ann@bos.co');
  assert.equal(account.full_name, 'Gym Owner');
});

// ---------------------------------------------------------------------------
// The ordering - what happens when it fails
// ---------------------------------------------------------------------------

test('A FAILED SEED LEAVES THE ACTIVATION LINK ALIVE', async () => {
  // The whole reason this runs before the link is consumed. Failing afterwards
  // would leave the owner activated, unable to reach their gym, and out of
  // links - needing a human to notice and issue another.
  const { deps, calls, token, code } = setup({ createGymAdmin: async () => false });

  const result = await completeActivation(deps, { token, code, password: PASSWORD }, { now: NOW });

  assert.equal(result.ok, false);
  assert.equal(calls.used.length, 0, 'the link is NOT consumed');
  assert.equal(calls.passwords.length, 0);
  assert.equal(calls.statuses.length, 0, 'and the gym is not opened');
});

test('a failed seed says something the owner can act on', async () => {
  const { deps, token, code } = setup({ createGymAdmin: async () => false });
  const result = await completeActivation(deps, { token, code, password: PASSWORD }, { now: NOW });

  assert.match(result.reason, /try that link again/i);
  assert.ok(!/schema|connection|null/i.test(result.reason), 'and nothing about the inside of the system');
});

test('the gym is opened only after the account exists', async () => {
  const order = [];
  const { deps, token, code } = setup({
    createGymAdmin: async () => { order.push('seed'); return true; },
    setGymStatus: async () => { order.push('open'); },
  });

  await completeActivation(deps, { token, code, password: PASSWORD }, { now: NOW });
  assert.deepEqual(order, ['seed', 'open'], 'an open gym whose owner cannot sign in is not open');
});

test('the audit records whether the account was made', async () => {
  // The fact somebody needs when an owner writes in saying they cannot get
  // into their own gym.
  const { deps, calls, token, code } = setup();
  await completeActivation(deps, { token, code, password: PASSWORD }, { now: NOW });

  const entry = calls.audits.find((a) => a.action === 'platform.owner.activated');
  assert.equal(entry.detail.gym_admin_created, true);
});

test('THE PASSWORD NEVER REACHES THE AUDIT LOG', async () => {
  const { deps, calls, token, code } = setup();
  await completeActivation(deps, { token, code, password: PASSWORD }, { now: NOW });

  assert.ok(!JSON.stringify(calls.audits).includes(PASSWORD));
});

test('a caller with no createGymAdmin still activates, and says so', async () => {
  // Reactivating a suspended owner's account goes through the same function
  // and has no gym to seed. It must not crash, and must not claim it seeded.
  const { deps, token, code } = setup({ createGymAdmin: undefined });
  const result = await completeActivation(deps, { token, code, password: PASSWORD }, { now: NOW });

  assert.equal(result.ok, true);
  assert.equal(result.gymAdminCreated, false);
  assert.equal(result.gymUsername, null);
});

test('activation hands back the username, so the owner can be TOLD it', async () => {
  // A credential created and never mentioned is a credential nobody uses.
  const { deps, token, code } = setup();
  const result = await completeActivation(deps, { token, code, password: PASSWORD }, { now: NOW });

  assert.equal(result.gymUsername, 'owner');
});

// ---------------------------------------------------------------------------
// Where they sign in
// ---------------------------------------------------------------------------

test('EVERY GYM HAS ITS OWN ADMIN ADDRESS', async () => {
  // The previous implementation read one PLATFORM_GYM_ADMIN_URL - a single
  // value, on a platform built for ten thousand gyms.
  assert.equal(gymAdminPath('bos-gym'), '/g/bos-gym/admin/login');
  assert.notEqual(gymAdminPath('bos-gym'), gymAdminPath('kom'));
});

test('a slug is escaped on the way into the path', async () => {
  assert.ok(!gymAdminPath('a/b').includes('a/b'));
});
