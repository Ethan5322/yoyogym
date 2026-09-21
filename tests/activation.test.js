// Unit tests for the activation rule: "payment recorded = member active".
// Members pay the gym directly; staff capture that payment, and the capture is
// what activates the member. These tests guard the path that replaced the old
// online-payment activation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activateForPayment } from '../server/lib/activation.js';

/**
 * Minimal Supabase stub. Records every update it is asked to perform so a test
 * can assert what was written, and can be told to fail a specific table.
 */
function fakeSupabase({ failTable = null, rows = {} } = {}) {
  const updates = [];
  function from(table) {
    const ctx = { table };
    const chain = {
      update(values) {
        ctx.op = 'update';
        ctx.values = values;
        return chain;
      },
      insert(values) {
        ctx.op = 'insert';
        ctx.values = values;
        return chain;
      },
      select() {
        return chain;
      },
      eq(col, val) {
        ctx.key = [col, val];
        if (ctx.op === 'update') {
          updates.push({ table, values: ctx.values, key: ctx.key });
          return Promise.resolve({ error: failTable === table ? { message: 'boom' } : null });
        }
        return chain;
      },
      maybeSingle() {
        return Promise.resolve({ data: rows[table] ?? null, error: null });
      },
      single() {
        return Promise.resolve({ data: rows[table] ?? null, error: null });
      },
      // Bare inserts (e.g. notifications_log) are awaited directly.
      then(resolve) {
        if (ctx.op === 'insert') updates.push({ table, values: ctx.values });
        return Promise.resolve({ data: null, error: null }).then(resolve);
      },
    };
    return chain;
  }
  return { from, updates };
}

const payment = {
  id: 'pay-1',
  member_id: 'mem-1',
  membership_id: 'mship-1',
  amount: 450,
  description: 'Monthly membership fee',
};

test('recording a payment activates both the membership and the member', async () => {
  const db = fakeSupabase({ rows: { members: { id: 'mem-1', full_name: 'Thabo M', email: 't@example.com', membership_number: 'GYM-2026-ABC123' } } });

  const result = await activateForPayment(db, payment);

  assert.equal(result.activated, true);
  assert.equal(result.error, undefined);

  const membership = db.updates.find((u) => u.table === 'memberships');
  assert.ok(membership, 'membership should be updated');
  assert.equal(membership.values.state, 'active');
  assert.deepEqual(membership.key, ['id', 'mship-1']);

  const member = db.updates.find((u) => u.table === 'members');
  assert.ok(member, 'member should be updated');
  assert.equal(member.values.status, 'active');
  assert.deepEqual(member.key, ['id', 'mem-1']);
});

test('a payment with no member records fine but activates nobody', async () => {
  const db = fakeSupabase();
  const result = await activateForPayment(db, { id: 'pay-2', amount: 50, description: 'Day pass' });

  assert.equal(result.activated, false);
  assert.equal(result.error, undefined, 'a member-less payment is not an error');
  assert.equal(db.updates.filter((u) => u.table === 'members').length, 0);
});

test('a failed membership update reports the error and does not touch the member', async () => {
  const db = fakeSupabase({ failTable: 'memberships' });
  const result = await activateForPayment(db, payment);

  assert.equal(result.activated, false);
  assert.match(result.error, /membership/);
  assert.equal(db.updates.filter((u) => u.table === 'members').length, 0, 'must not activate the member if the membership failed');
});

test('a failed member update is reported rather than silently swallowed', async () => {
  const db = fakeSupabase({ failTable: 'members' });
  const result = await activateForPayment(db, payment);

  assert.equal(result.activated, false);
  assert.match(result.error, /member/);
});

test('capturing the same payment twice is safe', async () => {
  const db = fakeSupabase({ rows: { members: { id: 'mem-1', full_name: 'Thabo M', email: 't@example.com', membership_number: 'GYM-2026-ABC123' } } });

  const first = await activateForPayment(db, payment);
  const second = await activateForPayment(db, payment);

  assert.equal(first.activated, true);
  assert.equal(second.activated, true, 'a second capture must not fail');
});

test('activation still succeeds when the member record cannot be read back', async () => {
  // No `members` row returned -> the receipt cannot be sent, but the member is
  // still activated. A notification problem must never block activation.
  const db = fakeSupabase({ rows: {} });
  const result = await activateForPayment(db, payment);

  assert.equal(result.activated, true);
});

test('activateForPayment handles a missing payment without throwing', async () => {
  const db = fakeSupabase();
  const result = await activateForPayment(db, null);
  assert.equal(result.activated, false);
  assert.ok(result.error);
});
