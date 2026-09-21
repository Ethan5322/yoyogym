// Provisioning orchestrator tests, written before the orchestrator.
//
// Provisioning creates a REAL Supabase project that costs real money every
// month. The failure that matters is not "it errored" — it is **a project
// created but not recorded**, which is a bill nobody knows about. These tests
// exist mostly to pin that down.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { provisionGym, PROVISION_STEPS } from '../platform/provisioning.js';

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

/** Records every side effect so a test can assert what really happened. */
function deps({ failAt = null } = {}) {
  const calls = [];
  const record = (name, payload) => {
    calls.push({ name, payload });
    if (failAt === name) throw new Error(`${name} exploded`);
  };
  return {
    calls,
    createSupabaseProject: async (opts) => {
      record('createSupabaseProject', opts);
      return { project_ref: 'abcdef123456', url: 'https://abcdef123456.supabase.co', service_key: 'svc-secret-value' };
    },
    applySchema: async (opts) => { record('applySchema', opts); return { applied: true }; },
    seed: async (opts) => { record('seed', opts); return { seeded: true }; },
    storeSecret: async (opts) => { record('storeSecret', opts); return { secret_ref: 'infisical://gyms/iron-works/credentials', version: 1 }; },
    saveGym: async (row) => { record('saveGym', row); return { ...row, id: 'gym-1' }; },
    saveConnection: async (row) => { record('saveConnection', row); return { ...row, id: 'conn-1' }; },
    saveSecretRef: async (row) => { record('saveSecretRef', row); return row; },
    recordMigrationBaseline: async (row) => { record('recordMigrationBaseline', row); return row; },
    audit: async (entry) => { record('audit', entry); },
  };
}

test('a dry run makes NO external calls and returns the plan', async () => {
  const d = deps();
  const result = await provisionGym(application, d, { dryRun: true });

  assert.equal(result.dryRun, true);
  assert.deepEqual(result.plan, PROVISION_STEPS, 'the plan is the real step list, not a summary');
  assert.equal(d.calls.length, 0, 'a dry run must not touch anything, least of all create a paid project');
});

test('dry run is the DEFAULT — provisioning never happens by accident', async () => {
  const d = deps();
  const result = await provisionGym(application, d);   // no options at all

  assert.equal(result.dryRun, true);
  assert.equal(d.calls.length, 0);
});

test('a live run executes every step in order', async () => {
  const d = deps();
  const result = await provisionGym(application, d, { dryRun: false });

  assert.equal(result.ok, true);
  assert.equal(result.gym.id, 'gym-1');
  const order = d.calls.map((c) => c.name).filter((n) => n !== 'audit');
  assert.deepEqual(order, [
    'createSupabaseProject',
    'applySchema',
    'seed',
    'storeSecret',
    'saveSecretRef',
    'saveGym',
    'saveConnection',
    'recordMigrationBaseline',
  ]);
});

test('the secret VALUE never reaches the database — only a reference', async () => {
  const d = deps({});
  await provisionGym(application, d, { dryRun: false });

  const saved = d.calls.find((c) => c.name === 'saveSecretRef').payload;
  const serialised = JSON.stringify(saved);

  assert.ok(saved.secret_ref, 'a reference is stored');
  assert.ok(!serialised.includes('svc-secret-value'), 'the service key must NEVER be written to the platform database');
  assert.ok(!('service_key' in saved), 'no secret-value field may exist on the row');
});

test('a failure AFTER the project exists still records it — no orphaned bill', async () => {
  // This is the expensive failure: Supabase has created a project we are being
  // charged for, and the step that would have recorded it blew up.
  const d = deps({ failAt: 'saveGym' });

  const result = await provisionGym(application, d, { dryRun: false });

  assert.equal(result.ok, false);
  assert.equal(result.failedAt, 'saveGym');
  assert.equal(result.orphanedProjectRef, 'abcdef123456',
    'a created-but-unrecorded project MUST be reported so it can be reconciled or deleted');

  const audited = d.calls.filter((c) => c.name === 'audit').map((c) => c.payload.action);
  assert.ok(audited.includes('gym.provision.failed'), 'the failure is audited');
});

test('it stops at the first failure and does not continue', async () => {
  const d = deps({ failAt: 'applySchema' });
  const result = await provisionGym(application, d, { dryRun: false });

  assert.equal(result.ok, false);
  const names = d.calls.map((c) => c.name);
  assert.ok(!names.includes('seed'), 'must not seed a database whose schema failed');
  assert.ok(!names.includes('saveGym'), 'must not register a gym that was never built');
});

test('a failure before the project exists reports no orphan', async () => {
  const d = deps({ failAt: 'createSupabaseProject' });
  const result = await provisionGym(application, d, { dryRun: false });

  assert.equal(result.ok, false);
  assert.equal(result.orphanedProjectRef, null, 'nothing was created, so nothing is orphaned');
});

test('the gym is registered as pending, not active — payment comes first', async () => {
  const d = deps();
  await provisionGym(application, d, { dryRun: false });

  const gym = d.calls.find((c) => c.name === 'saveGym').payload;
  assert.equal(gym.status, 'pending', 'D-049: provisioned, but not live until the first payment');
  assert.equal(gym.slug, 'iron-works');
  assert.equal(gym.latitude, -33.9249, 'coordinates carry through for app search');
});
