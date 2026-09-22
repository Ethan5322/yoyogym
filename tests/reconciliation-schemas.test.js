// Schema drift.
//
// The project-per-gym reconciliation next door looks for Supabase projects
// nobody is paying attention to. Under schema-per-gym (D-096) there is only
// one project, so the same failure now leaves a SCHEMA behind instead — and
// the cost of missing it is different in kind, not just in amount: an orphan
// schema can hold a real person's data with nobody accountable for it.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { reconcileSchemas } from '../platform/reconciliation.js';

const deps = (over = {}) => ({
  listSchemas: async () => ['gym_bos', 'gym_iron'],
  listConnections: async () => [
    { gym_id: 'g1', schema_name: 'gym_bos', status: 'healthy' },
    { gym_id: 'g2', schema_name: 'gym_iron', status: 'healthy' },
  ],
  audit: async () => {},
  ...over,
});

test('a matched estate reports clean', async () => {
  const report = await reconcileSchemas(deps());

  assert.equal(report.ok, true);
  assert.equal(report.orphans.length, 0);
  assert.equal(report.dangling.length, 0);
});

test('a schema no gym owns is an orphan, and is called a data risk, not a cost', async () => {
  // Under schema-per-gym the money is ~zero (D-100). What is NOT zero is a
  // half-provisioned schema holding a member's name and ID number with no
  // gym record saying whose responsibility it is.
  const report = await reconcileSchemas(deps({ listSchemas: async () => ['gym_bos', 'gym_iron', 'gym_ghost'] }));

  assert.equal(report.ok, false);
  assert.equal(report.orphans.length, 1);
  assert.equal(report.orphans[0].schema_name, 'gym_ghost');
  assert.match(report.orphans[0].risk, /data/i);
});

test('a gym pointing at a schema that does not exist is dangling — that gym is broken', async () => {
  const report = await reconcileSchemas(deps({ listSchemas: async () => ['gym_bos'] }));

  assert.equal(report.dangling.length, 1);
  assert.equal(report.dangling[0].gym_id, 'g2');
});

test('a retired gym is accounted for, not reported as broken', async () => {
  const report = await reconcileSchemas(
    deps({
      listSchemas: async () => ['gym_bos'],
      listConnections: async () => [
        { gym_id: 'g1', schema_name: 'gym_bos', status: 'healthy' },
        { gym_id: 'g2', schema_name: 'gym_iron', status: 'retired' },
      ],
    })
  );

  assert.equal(report.dangling.length, 0);
});

test('system schemas are never mistaken for an abandoned gym', async () => {
  // public, platform, storage, auth and the rest are not gyms. Reporting them
  // as orphans would make the report noise, and a noisy report is not read.
  const report = await reconcileSchemas(
    deps({ listSchemas: async () => ['public', 'platform', 'auth', 'storage', 'extensions', 'gym_bos', 'gym_iron'] })
  );

  assert.equal(report.orphans.length, 0);
});

test('reconciliation is not given anything that could drop a schema', async () => {
  const d = deps({ listSchemas: async () => ['gym_bos', 'gym_iron', 'gym_ghost'] });
  await reconcileSchemas(d);

  // The guarantee is structural, not a promise in a comment: there is no
  // function here capable of destroying anything.
  assert.ok(!('dropSchema' in d));
  assert.ok(!('runSql' in d));
});

test('findings are audited even when nothing is wrong', async () => {
  const entries = [];
  await reconcileSchemas(deps({ audit: async (e) => entries.push(e) }));

  assert.equal(entries.length, 1, 'an unread clean report still leaves a trace');
});
