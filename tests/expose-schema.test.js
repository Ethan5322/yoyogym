// Exposing a new gym's schema to the API.
//
// This runs once per gym and touches a setting that belongs to EVERY gym on
// the project. Getting it wrong does not break the new gym — it breaks all of
// them, and the only symptom is PGRST106 on everything at once.
//
// The SQL is checked as text because it cannot be run here: it needs a real
// Supabase project and the Management API. Text is a weak test, and it is
// still enough to catch the two mistakes that matter.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_MANAGEMENT_TOKEN = 'test-only';
process.env.SUPABASE_PROJECT_REF = 'test-ref';

import { schemaRunnerDeps } from '../platform/schema-runner.js';

/** Capture the SQL without sending it anywhere. */
function captureSql() {
  const sent = [];
  global.fetch = async (url, init) => {
    sent.push(JSON.parse(init.body).query);
    return { ok: true, json: async () => ({}) };
  };
  return sent;
}

test('IT READS pg_roles.rolconfig, NOT pg_settings', async () => {
  // The list is stored on the authenticator ROLE. pg_settings shows the
  // CURRENT session's value, and this runs as postgres — so it would find
  // nothing, fall back to a bare default, and overwrite the role with it.
  const sent = captureSql();
  await schemaRunnerDeps().exposeSchema('gym_newgym');

  // Comments stripped before asserting: the SQL explains WHY pg_settings is
  // wrong, and that prose would otherwise fail a test looking for the word.
  // What matters is what the query DOES, not what it says about itself.
  const sql = sent
    .join('\n')
    .split('\n')
    .map((line) => line.split('--')[0])
    .join('\n');

  assert.match(sql, /pg_roles/, 'the setting lives on the role');
  assert.match(sql, /rolconfig/);
  assert.ok(!/pg_settings/.test(sql), 'pg_settings reads the session, not the role, and comes back empty here');
});

test('THE EXISTING SCHEMAS ARE APPENDED TO, NEVER REPLACED', async () => {
  // This list belongs to every gym on the project. Replacing it would drop
  // KOM and the platform schema, and the whole system would fail at once.
  const sent = captureSql();
  await schemaRunnerDeps().exposeSchema('gym_newgym');

  const sql = sent.join('\n');
  assert.match(sql, /current_schemas \|\| /, 'it must concatenate');
  assert.match(sql, /position\('gym_newgym' in current_schemas\) = 0/, 'and skip if already there');
});

test('both reload signals are sent, config before schema', async () => {
  // reload config says WHICH schemas; reload schema says what is inside them.
  // Only one, or the wrong order, leaves the gym exposed with no tables
  // visible — which reads as "table not found" and sends somebody hunting.
  const sent = captureSql();
  await schemaRunnerDeps().exposeSchema('gym_newgym');

  const sql = sent.join('\n');
  const config = sql.indexOf("'reload config'");
  const schema = sql.indexOf("'reload schema'");

  assert.ok(config > -1, 'reload config is required');
  assert.ok(schema > -1, 'reload schema is required');
  assert.ok(config < schema, 'config first, or the cache is rebuilt before the schema is allowed');
});

test('an unsafe schema name never reaches the SQL', async () => {
  // This value is interpolated into DDL.
  for (const bad of ['gym; drop schema platform', 'GYM-A', '../etc']) {
    await assert.rejects(() => schemaRunnerDeps().exposeSchema(bad), /Unsafe schema name/);
  }
});
