// Per-gym counts for the main panel (D-130).
//
// §16 asks for aggregate gym statistics; D-044 says platform staff never see a
// gym's member data. The user resolved it: COUNTS ONLY, NEVER NAMES.
//
// The important tests here are not that the numbers are right. They are that
// no row of member data can come back AT ALL — which is a property of how the
// queries are built, not of how carefully the caller behaves afterwards.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { gymStats, overPlanLimit, FORBIDDEN_COLUMNS, READABLE_COLUMNS } from '../platform/stats.js';

const NOW = new Date('2026-09-22T12:00:00Z');

/** Columns as they exist in db/schema.sql. */
const REAL_COLUMNS = {
  members: ['status', 'created_at'],
  checkins: ['checked_in_at', 'checked_out_at', 'member_id'],
};

/** A client that records exactly what was asked of it. */
function spyClient({ counts = { members: 87, checkins: 412 }, lastAt = '2026-09-21T18:00:00Z', fail = false } = {}) {
  const calls = [];
  const client = {
    calls,
    from(table) {
      const q = {
        _table: table,
        select(cols, opts) {
          calls.push({ table, cols, head: Boolean(opts?.head), count: opts?.count });
          return q;
        },
        eq: () => q,
        // THE REAL COLUMNS. This fake used to accept any name, which is how
        // a query on a column gym.checkins does not have passed its tests.
        gte: (col) => { if (!REAL_COLUMNS[table]?.includes(col)) q._error = `no column ${col}`; return q; },
        order: (col) => { if (!REAL_COLUMNS[table]?.includes(col)) q._error = `no column ${col}`; return q; },
        limit: () => q,
        maybeSingle: async () => {
          if (fail) throw new Error('unreachable');
          if (q._error) return { data: null, error: { message: q._error } };
          return { data: { checked_in_at: lastAt } };
        },
        then(resolve, reject) {
          if (fail) return reject(new Error('unreachable'));
          const count = table === 'members' ? counts.members : counts.checkins;
          if (q._error) return resolve({ count: null, data: null, error: { message: q._error } });
          return resolve({ count, data: null });
        },
      };
      return q;
    },
  };
  return client;
}

// ---------------------------------------------------------------------------
// The property that matters
// ---------------------------------------------------------------------------

test('NO MEMBER ROW IS EVER REQUESTED — the counts use head:true', async () => {
  // head: true means the database returns the count in a header and NO ROWS.
  // There is no array of members to log, serialise or accidentally return.
  const client = spyClient();
  await gymStats(client, { now: NOW });

  const counting = client.calls.filter((c) => c.count === 'exact');
  assert.ok(counting.length >= 2, 'the counts are counts');
  for (const call of counting) {
    assert.equal(call.head, true, `${call.table} must send no rows back`);
  }
});

test('NOT ONE FORBIDDEN COLUMN IS EVER NAMED', async () => {
  const client = spyClient();
  await gymStats(client, { now: NOW });

  const asked = client.calls.map((c) => String(c.cols)).join(' ');
  for (const column of FORBIDDEN_COLUMNS) {
    assert.ok(!asked.includes(column), `${column} must never be requested by the platform`);
  }
});

test('the only column read by name is a timestamp', () => {
  assert.deepEqual(READABLE_COLUMNS, ['checked_in_at']);
  for (const column of READABLE_COLUMNS) {
    assert.ok(!FORBIDDEN_COLUMNS.includes(column));
  }
});

test('the readable column list cannot be widened by a caller', () => {
  // Fixed in the module, not passed in — so no future call site can add to it.
  assert.throws(() => READABLE_COLUMNS.push('full_name'));
  assert.throws(() => FORBIDDEN_COLUMNS.push('x'));
});

// ---------------------------------------------------------------------------
// The numbers
// ---------------------------------------------------------------------------

test('counts come back as numbers', async () => {
  const stats = await gymStats(spyClient(), { now: NOW });

  assert.equal(stats.activeMembers, 87);
  assert.equal(stats.checkinsThisMonth, 412);
  assert.equal(stats.lastActivityAt, '2026-09-21T18:00:00Z');
  assert.equal(stats.reachable, true);
});

test('an unreachable gym is a FACT, not an error that breaks the page', async () => {
  const stats = await gymStats(spyClient({ fail: true }), { now: NOW });

  assert.equal(stats.reachable, false);
  assert.equal(stats.activeMembers, null);
});

test('no client at all is handled the same way', async () => {
  const stats = await gymStats(null, { now: NOW });
  assert.equal(stats.reachable, false);
});

// ---------------------------------------------------------------------------
// Outgrowing a plan
// ---------------------------------------------------------------------------

test('a gym over its plan limit is reported, with the reassurance attached', async () => {
  const result = overPlanLimit(300, { max_active_members: 40 });

  assert.equal(result.over, true);
  assert.equal(result.limit, 40);
  // The first thing an owner asks is whether their members have been cut off.
  assert.match(result.note, /Existing members are unaffected/i);
});

test('a gym inside its limit is not nagged', () => {
  const result = overPlanLimit(30, { max_active_members: 40 });

  assert.equal(result.over, false);
  assert.equal(result.note, null);
});

test('an unpriced or unlimited plan yields no verdict rather than a wrong one', () => {
  assert.equal(overPlanLimit(30, {}), null);
  assert.equal(overPlanLimit(30, null), null);
});

test('AN UNKNOWN COUNT IS NOT ZERO', () => {
  // Number(null) is 0 and Number.isFinite(0) is true. A looser check reports a
  // gym whose schema could not be reached as "0 members, well within its plan"
  // — a confident answer about a gym nobody could see.
  assert.equal(overPlanLimit(null, { max_active_members: 40 }), null);
  assert.equal(overPlanLimit(undefined, { max_active_members: 40 }), null);
  assert.equal(overPlanLimit('', { max_active_members: 40 }), null);
});

test('NOTHING HERE BLOCKS ANYTHING', () => {
  // The gym app already refuses new registrations over the limit (D-101) and a
  // plan change never removes a member (D-102). This is so the panel can start
  // the upgrade conversation, not so it can act.
  const result = overPlanLimit(300, { max_active_members: 40 });

  assert.ok(!('block' in result));
  assert.ok(!('suspend' in result));
});

test('THE ACTIVITY FIGURES READ A COLUMN THE CHECK-INS TABLE ACTUALLY HAS', async () => {
  const { readFileSync } = await import('node:fs');
  const schema = readFileSync('db/schema.sql', 'utf8');
  const table = schema.slice(schema.indexOf('create table if not exists gym.checkins'), schema.indexOf(');', schema.indexOf('create table if not exists gym.checkins')));
  for (const column of READABLE_COLUMNS) {
    assert.ok(table.split(/\s+/).includes(column), `gym.checkins has a column called ${column}`);
  }

  const stats = await gymStats(spyClient({ lastAt: '2026-09-21T18:00:00Z' }), { now: NOW });
  assert.equal(stats.checkinsThisMonth, 412);
  assert.equal(stats.lastActivityAt, '2026-09-21T18:00:00Z');
});

test('a query that fails is reported as unreadable, not as blank figures', async () => {
  const client = spyClient();
  const from = client.from.bind(client);
  client.from = (table) => { const q = from(table); q._error = 'boom'; return q; };
  const stats = await gymStats(client, { now: NOW });
  assert.equal(stats.reachable, false);
});
