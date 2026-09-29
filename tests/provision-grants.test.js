// What a brand-new gym's schema needs before the server can use it, and the
// check that the saved token works before an approval is recorded.
//
// Found by reading the provisioner before its first live run (2026-09-29):
// db/schema.sql grants nothing, and a schema created by SQL is closed to the
// API roles until it is granted (Supabase's "Using custom schemas" guide). The
// first gym would have been created, registered and exposed — and then every
// read would have failed with "permission denied for schema".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.SUPABASE_MANAGEMENT_TOKEN = 'test-only';
process.env.SUPABASE_PROJECT_REF = 'test-ref';

import { schemaRunnerDeps, accessGrantsFor, canReachProject } from '../platform/schema-runner.js';

function captureSql(status = 200) {
  const sent = [];
  global.fetch = async (url, init) => {
    sent.push(JSON.parse(init.body).query);
    return { ok: status < 400, status, json: async () => ({}) };
  };
  return sent;
}

test('applying the schema also lets the server key in, AFTER the tables exist', async () => {
  const sent = captureSql();
  await schemaRunnerDeps().applySchema('gym_iron_works');

  assert.equal(sent.length, 2, 'the schema, then the grants');
  assert.match(sent[0], /create table if not exists gym_iron_works\.members/);
  assert.match(sent[1], /grant usage on schema gym_iron_works to service_role;/);
  assert.match(sent[1], /grant all on all tables in schema gym_iron_works to service_role;/);
  assert.match(sent[1], /alter default privileges in schema gym_iron_works grant all on tables to service_role;/);
});

test('the grants are for the server key ONLY — never the browser roles', () => {
  const sql = accessGrantsFor('gym_iron_works');
  assert.doesNotMatch(sql, /\banon\b/);
  assert.doesNotMatch(sql, /\bauthenticated\b/);
  assert.doesNotMatch(sql, /\bpublic\b/i);
  for (const line of sql.split('\n')) assert.match(line, /to service_role;$/);
});

test('an unsafe schema name is refused before any grant is written', () => {
  for (const bad of ['gym; drop schema gym', 'Gym', '', 'gym-x']) {
    assert.throws(() => accessGrantsFor(bad), /Unsafe schema name/);
  }
});

test('canReachProject reports a refused token by status, and a working one as ok', async () => {
  captureSql(401);
  const refused = await canReachProject();
  assert.equal(refused.ok, false);
  assert.match(refused.reason, /401/);

  const sent = captureSql(200);
  assert.deepEqual(await canReachProject(), { ok: true });
  assert.equal(sent[0], 'select 1;', 'it only reads');
});

test('every table in the gym schema has row level security switched on', () => {
  // A new gym is built from db/schema.sql alone. Four tables added by later
  // migrations were missing from its RLS list, so KOM had RLS on them and a
  // new gym would not have.
  const sql = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
  const tables = [...sql.matchAll(/create table if not exists gym\.([a-z_]+)/g)].map((m) => m[1]);
  const list = sql.slice(sql.indexOf('foreach t in array array['));
  const protectedTables = [...list.slice(0, list.indexOf(']')).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

  assert.ok(tables.length > 20);
  assert.deepEqual(tables.filter((t) => !protectedTables.includes(t)), []);
});
