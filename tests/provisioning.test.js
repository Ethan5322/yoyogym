// Provisioning tests, for schema-per-gym.
//
// A gym is a SCHEMA in the shared project (D-096). The failure that matters is
// a schema created but never registered: a gym's tables sitting in a database
// that the registry knows nothing about.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { provisionGym, PROVISION_STEPS, schemaNameFor } from '../platform/provisioning.js';

/**
 * A real live run always carries one: it records which schema version a gym
 * was built from, and provisioning refuses without it rather than failing on
 * a NOT NULL constraint at step six of seven.
 */
const CHECKSUM = 'sha256-of-db-schema-sql';

const application = {
  id: 'app-1',
  proposed_gym_name: 'Iron Works',
  slug: 'iron-works',
  country: 'ZA',
  city: 'Cape Town',
  latitude: -33.9249,
  longitude: 18.4241,
  owner_user_id: 'user-1',
};

function deps({ failAt = null } = {}) {
  const calls = [];
  const record = (name, payload) => {
    calls.push({ name, payload });
    if (failAt === name) throw new Error(`${name} exploded`);
  };
  return {
    calls,
    createSchema: async (s) => record('createSchema', s),
    applySchema: async (s) => record('applySchema', s),
    seed: async (s, a) => record('seed', { schema: s, app: a.id }),
    saveGym: async (row) => { record('saveGym', row); return { ...row, id: 'gym-1' }; },
    startSubscription: async (row) => { record('startSubscription', row); return { ...row, id: 'sub-1' }; },
    saveConnection: async (row) => { record('saveConnection', row); return { ...row, id: 'conn-1' }; },
    recordMigrationBaseline: async (row) => record('recordMigrationBaseline', row),
    exposeSchema: async (s) => record('exposeSchema', s),
    audit: async (e) => record('audit', e),
  };
}

test('a slug becomes a safe schema name, with no 26-gym ceiling', () => {
  assert.equal(schemaNameFor('iron-works'), 'gym_iron_works');
  assert.equal(schemaNameFor('BOS GYM'), 'gym_bos_gym');
  assert.equal(schemaNameFor('flex--house!!'), 'gym_flex_house');
  assert.equal(schemaNameFor(''), null);
  assert.equal(schemaNameFor('!!!'), null);
});

test('a dry run makes NO changes and returns the plan', async () => {
  const d = deps();
  const r = await provisionGym(application, d, { dryRun: true });

  assert.equal(r.dryRun, true);
  assert.equal(r.schema, 'gym_iron_works');
  assert.deepEqual(r.plan, PROVISION_STEPS);
  assert.equal(d.calls.length, 0);
});

test('dry run is the DEFAULT — provisioning never happens by accident', async () => {
  const d = deps();
  const r = await provisionGym(application, d); // no options
  assert.equal(r.dryRun, true);
  assert.equal(d.calls.length, 0);
});

test('a live run executes every step in order', async () => {
  const d = deps();
  const r = await provisionGym(application, d, { dryRun: false, schemaChecksum: CHECKSUM });

  assert.equal(r.ok, true);
  assert.equal(r.schema, 'gym_iron_works');
  const order = d.calls.map((c) => c.name).filter((n) => n !== 'audit');
  assert.deepEqual(order, PROVISION_STEPS);
});

test('exposing the schema is LAST — it reloads PostgREST for every gym', async () => {
  const d = deps();
  await provisionGym(application, d, { dryRun: false, schemaChecksum: CHECKSUM });

  const names = d.calls.map((c) => c.name).filter((n) => n !== 'audit');
  assert.equal(names.at(-1), 'exposeSchema', 'everything that can fail must fail before this');
});

test('a failure AFTER the schema exists reports it — no invisible schema', async () => {
  const d = deps({ failAt: 'saveGym' });
  const r = await provisionGym(application, d, { dryRun: false, schemaChecksum: CHECKSUM });

  assert.equal(r.ok, false);
  assert.equal(r.failedAt, 'saveGym');
  assert.equal(r.orphanedSchema, 'gym_iron_works', 'a created-but-unregistered schema must be reported');
  assert.ok(d.calls.some((c) => c.name === 'audit' && c.payload.action === 'gym.provision.failed'));
});

test('a failure before the schema exists reports no orphan', async () => {
  const d = deps({ failAt: 'createSchema' });
  const r = await provisionGym(application, d, { dryRun: false, schemaChecksum: CHECKSUM });

  assert.equal(r.ok, false);
  assert.equal(r.orphanedSchema, null);
});

test('it stops at the first failure', async () => {
  const d = deps({ failAt: 'applySchema' });
  const r = await provisionGym(application, d, { dryRun: false, schemaChecksum: CHECKSUM });

  assert.equal(r.ok, false);
  const names = d.calls.map((c) => c.name);
  assert.ok(!names.includes('seed'), 'never seed a schema whose tables failed');
  assert.ok(!names.includes('exposeSchema'), 'never expose a broken schema to the API');
});

test('a slug that cannot make a safe schema name is refused before anything runs', async () => {
  const d = deps();
  const r = await provisionGym({ ...application, slug: '!!!' }, d, { dryRun: false, schemaChecksum: CHECKSUM });

  assert.equal(r.ok, false);
  assert.equal(r.failedAt, 'schemaName');
  assert.equal(d.calls.length, 0);
});

test('the gym is registered as pending — payment activates it', async () => {
  const d = deps();
  await provisionGym(application, d, { dryRun: false, schemaChecksum: CHECKSUM });

  const gym = d.calls.find((c) => c.name === 'saveGym').payload;
  assert.equal(gym.status, 'pending');
  assert.equal(gym.latitude, -33.9249, 'coordinates carry through for app search');

  const conn = d.calls.find((c) => c.name === 'saveConnection').payload;
  assert.equal(conn.schema_name, 'gym_iron_works');
  assert.equal(conn.supabase_url, null, 'schema mode: no per-gym project');
});

test('provisioning opens the trial, or the gym would be refused for payment on day one', async () => {
  // A gym with no subscription row fails accessFor() with a 402. Provisioning
  // is the only moment at which that row can be created before anybody tries
  // to use the gym.
  const d = deps();
  const r = await provisionGym(application, d, { dryRun: false, schemaChecksum: CHECKSUM, plan: { id: 'plan-basic' } });

  const sub = d.calls.find((c) => c.name === 'startSubscription').payload;
  assert.equal(sub.status, 'trialing');
  assert.equal(sub.gym_id, 'gym-1');
  assert.equal(sub.plan_id, 'plan-basic');
  assert.ok(sub.trial_ends_at, 'a trial with no end date never ends');

  // The gym itself is still pending: a trial is a subscription state, not a
  // live gym. Activation is what opens the doors.
  assert.equal(d.calls.find((c) => c.name === 'saveGym').payload.status, 'pending');
  assert.equal(r.ok, true);
});

// ---------------------------------------------------------------------------
// Failing before anything exists, rather than halfway through
// ---------------------------------------------------------------------------

test('WITHOUT A CHECKSUM IT REFUSES, AND CREATES NOTHING', async () => {
  // migration_runs.checksum is NOT NULL. Without this guard the run would
  // create the schema, apply it, seed it, save two rows — and then fail on a
  // constraint at step six of seven, leaving a real schema behind that the
  // registry only half knows about.
  //
  // A missing checksum also means db/schema.sql could not be read, so there is
  // nothing to apply either.
  const d = deps();
  const r = await provisionGym(application, d, { dryRun: false, schemaChecksum: null });

  assert.equal(r.ok, false);
  assert.equal(r.failedAt, 'schemaChecksum');
  assert.equal(d.calls.length, 0, 'not one step ran');
  assert.equal(r.orphanedSchema, null, 'and nothing was left behind');
});

test('a dry run does not need a checksum — it creates nothing anyway', async () => {
  const r = await provisionGym(application, deps(), { dryRun: true });
  assert.equal(r.ok, true);
});

test('with a checksum it proceeds as normal', async () => {
  const d = deps();
  const r = await provisionGym(application, d, { dryRun: false, schemaChecksum: 'abc123' });

  assert.equal(r.ok, true);
  const baseline = d.calls.find((c) => c.name === 'recordMigrationBaseline');
  assert.equal(baseline.payload.checksum, 'abc123', 'recorded, so drift can be spotted later');
});
