// Owner activation — the link and the code.
//
// This is the step between "your gym was approved" and the owner being able to
// sign in. It is the first time a stranger's credential decides anything on
// this platform, so most of these tests are about refusing.
//
// Named activation-owner to keep it clear of tests/activation.test.js, which
// is the gym app's MEMBER activation and a different thing entirely.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ACTIVATION_TTL_HOURS,
  issueActivation,
  checkActivation,
  completeActivation,
} from '../platform/activation.js';

const T0 = new Date('2026-04-01T00:00:00Z');
const hours = (n, from = T0) => new Date(from.getTime() + n * 3_600_000);

// ---------------------------------------------------------------------------
// Issuing
// ---------------------------------------------------------------------------

test('issuing returns the secrets once and stores only hashes', () => {
  const { row, token, code } = issueActivation({ userId: 'u1', gymId: 'g1', now: T0 });

  assert.ok(token.length >= 32, 'a guessable link is not a link');
  assert.match(code, /^[0-9]{6}$/);

  // The whole point. A stolen database must not yield working activation links.
  const serialised = JSON.stringify(row);
  assert.ok(!serialised.includes(token), 'the raw token must never be stored');
  assert.ok(!serialised.includes(code), 'nor the raw code');
  assert.ok(row.token_hash && row.code_hash);
  assert.equal(row.used_at, null);
});

test('the activation expires, and the window is stated not implied', () => {
  const { row } = issueActivation({ userId: 'u1', gymId: 'g1', now: T0 });
  assert.equal(new Date(row.expires_at).toISOString(), hours(ACTIVATION_TTL_HOURS).toISOString());
});

test('two activations never collide', () => {
  const a = issueActivation({ userId: 'u1', gymId: 'g1', now: T0 });
  const b = issueActivation({ userId: 'u1', gymId: 'g1', now: T0 });

  assert.notEqual(a.token, b.token);
  assert.notEqual(a.row.token_hash, b.row.token_hash);
});

// ---------------------------------------------------------------------------
// Checking
// ---------------------------------------------------------------------------

test('the right token and the right code pass', () => {
  const { row, token, code } = issueActivation({ userId: 'u1', gymId: 'g1', now: T0 });
  assert.equal(checkActivation(row, { token, code }, hours(1)).ok, true);
});

test('the right token with the WRONG code is refused', () => {
  // Both halves are required, or the emailed link alone would be enough and
  // the code would be decoration.
  const { row, token } = issueActivation({ userId: 'u1', gymId: 'g1', now: T0 });
  assert.equal(checkActivation(row, { token, code: '000000' }, hours(1)).ok, false);
});

test('the right code with the WRONG token is refused', () => {
  const { row, code } = issueActivation({ userId: 'u1', gymId: 'g1', now: T0 });
  assert.equal(checkActivation(row, { token: 'not-the-token', code }, hours(1)).ok, false);
});

test('an expired activation is refused even when both halves are correct', () => {
  const { row, token, code } = issueActivation({ userId: 'u1', gymId: 'g1', now: T0 });
  const result = checkActivation(row, { token, code }, hours(ACTIVATION_TTL_HOURS + 1));

  assert.equal(result.ok, false);
  assert.match(result.reason, /expired/i);
});

test('an already-used activation cannot be replayed', () => {
  const { row, token, code } = issueActivation({ userId: 'u1', gymId: 'g1', now: T0 });
  const used = { ...row, used_at: hours(1).toISOString() };

  assert.equal(checkActivation(used, { token, code }, hours(2)).ok, false);
});

test('a missing record is refused without saying it is missing', () => {
  // The message is the same as a wrong code, so the endpoint cannot be used to
  // discover which activation tokens exist.
  const a = checkActivation(null, { token: 'x', code: '123456' }, T0);
  const b = checkActivation(
    issueActivation({ userId: 'u1', gymId: 'g1', now: T0 }).row,
    { token: 'x', code: '123456' },
    T0
  );

  assert.equal(a.ok, false);
  assert.equal(a.reason, b.reason, 'one message for every failure');
});

test('a comparison against a different-length value returns false, not a throw', () => {
  const { row, code } = issueActivation({ userId: 'u1', gymId: 'g1', now: T0 });
  assert.doesNotThrow(() => checkActivation(row, { token: 'short', code }, T0));
});

// ---------------------------------------------------------------------------
// Completing
// ---------------------------------------------------------------------------

function deps(over = {}) {
  const calls = { passwords: [], used: [], gyms: [], audits: [] };
  const issued = issueActivation({ userId: 'u1', gymId: 'g1', now: T0 });
  return {
    calls,
    issued,
    findActivation: async () => issued.row,
    setPassword: async (userId, hash) => { calls.passwords.push({ userId, hash }); },
    markUsed: async (id, at) => { calls.used.push({ id, at }); },
    setGymStatus: async (gymId, status) => { calls.gyms.push({ gymId, status }); },
    audit: async (a) => { calls.audits.push(a); },
    ...over,
  };
}

test('completing sets the password, consumes the activation and audits it', async () => {
  const d = deps();
  const result = await completeActivation(
    d,
    { token: d.issued.token, code: d.issued.code, password: 'a-long-enough-password' },
    { now: hours(1) }
  );

  assert.equal(result.ok, true);
  assert.equal(d.calls.passwords.length, 1);
  assert.ok(d.calls.passwords[0].hash.startsWith('$2'), 'stored as a bcrypt hash, never plaintext');
  assert.equal(d.calls.used.length, 1, 'consumed, so the link cannot be reused');
  assert.ok(d.calls.audits.some((a) => a.action === 'platform.owner.activated'));
});

test('a short password is refused BEFORE the activation is consumed', async () => {
  // Otherwise a typo burns the link and the owner has to ask for a new one.
  const d = deps();
  const result = await completeActivation(
    d,
    { token: d.issued.token, code: d.issued.code, password: 'short' },
    { now: hours(1) }
  );

  assert.equal(result.ok, false);
  assert.equal(d.calls.used.length, 0, 'the link survives a bad password');
  assert.equal(d.calls.passwords.length, 0);
});

test('a wrong code sets no password and consumes nothing', async () => {
  const d = deps();
  const result = await completeActivation(
    d,
    { token: d.issued.token, code: '000000', password: 'a-long-enough-password' },
    { now: hours(1) }
  );

  assert.equal(result.ok, false);
  assert.equal(d.calls.passwords.length, 0);
  assert.equal(d.calls.used.length, 0);
});

// ---------------------------------------------------------------------------
// Q-46 — the part that is NOT decided
// ---------------------------------------------------------------------------

test('by default activation does NOT open the gym — D-049 still stands', async () => {
  // D-049 says the first payment activates a gym; D-070 promises a 30-day
  // trial. Until the user settles Q-46, the existing decision is honoured and
  // activation does not touch the gym's status.
  const d = deps();
  const result = await completeActivation(
    d,
    { token: d.issued.token, code: d.issued.code, password: 'a-long-enough-password' },
    { now: hours(1) }
  );

  assert.equal(d.calls.gyms.length, 0, 'no gym status is written');
  assert.equal(result.gymActivated, false);
});

test('opting in to Q-46 option A opens the gym, in one argument', async () => {
  // Proof that answering Q-46 is a one-line change, not a rewrite.
  const d = deps();
  const result = await completeActivation(
    d,
    { token: d.issued.token, code: d.issued.code, password: 'a-long-enough-password' },
    { now: hours(1), activatesGym: true }
  );

  assert.deepEqual(d.calls.gyms[0], { gymId: 'g1', status: 'active' });
  assert.equal(result.gymActivated, true);
});
