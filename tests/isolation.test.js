// Tenant-isolation tests — the Stage 5 gate.
//
// The rule these defend: "Gym 1 must not see Gym 2 data." The resolver replaces
// RLS as the isolation mechanism, so a bug here is a cross-tenant leak of health
// and biometric data.
//
// TWO TENANCY SHAPES, one resolver:
//
//   SCHEMA MODE (the one in use)   — all gyms share ONE Supabase project, each
//     with its own Postgres schema: gym_ironworks.members, gym_flexhouse.members.
//     Free, and the existing code already speaks it, because getSupabase()
//     always configured `db.schema`.
//
//   PROJECT MODE (kept available)  — a gym has its own Supabase project and its
//     own credentials. For a gym that outgrows the shared project, or wants its
//     data in its own account.
//
// Isolation in schema mode is LOGICAL, not physical: every gym is in one
// database. That makes these tests more important than they were when each gym
// had its own project, not less. Tests 6, 7 and 8 are the ones that matter.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveGym, runWithGym, currentGym, ResolutionError } from '../server/lib/tenancy.js';

const SHARED = { url: 'https://shared.supabase.co', key: 'shared-service-key' };

const REGISTRY = {
  // Schema mode: no per-gym url or key, just a schema in the shared project.
  'iron-works': {
    gym: { id: 'gym-a', slug: 'iron-works', status: 'active' },
    connection: { id: 'conn-a', schema_name: 'gym_ironworks', status: 'healthy' },
  },
  'flex-house': {
    gym: { id: 'gym-b', slug: 'flex-house', status: 'active' },
    connection: { id: 'conn-b', schema_name: 'gym_flexhouse', status: 'healthy' },
  },
  // Project mode: its own project entirely.
  'own-project': {
    gym: { id: 'gym-own', slug: 'own-project', status: 'active' },
    connection: {
      id: 'conn-own',
      supabase_url: 'https://own.supabase.co',
      schema_name: 'gym',
      status: 'healthy',
    },
  },
  // A connection with NO schema — must never fall back to the default.
  'no-schema': {
    gym: { id: 'gym-x', slug: 'no-schema', status: 'active' },
    connection: { id: 'conn-x', schema_name: null, status: 'healthy' },
  },
  suspended: {
    gym: { id: 'gym-c', slug: 'suspended', status: 'suspended' },
    connection: { id: 'conn-c', schema_name: 'gym_c', status: 'healthy' },
  },
  'trial-over': {
    gym: { id: 'gym-d', slug: 'trial-over', status: 'pending' },
    connection: { id: 'conn-d', schema_name: 'gym_d', status: 'healthy' },
  },
  unreachable: {
    gym: { id: 'gym-e', slug: 'unreachable', status: 'active' },
    connection: { id: 'conn-e', schema_name: 'gym_e', status: 'unreachable' },
  },
};

const SECRETS = { 'gym-own': { service_key: 'own-key' } };

function deps({ secretFails = false, delayFor = null } = {}) {
  const built = [];
  return {
    built,
    shared: SHARED,
    lookupGym: async (slug) => REGISTRY[slug] ?? null,
    fetchSecrets: async (gymId) => {
      if (secretFails) throw new Error('secrets store unavailable');
      if (delayFor === gymId) await new Promise((r) => setTimeout(r, 25));
      return SECRETS[gymId] ?? null;
    },
    createClient: (url, key, opts) => {
      const client = { url, key, schema: opts?.db?.schema };
      built.push(client);
      return client;
    },
  };
}

// ---------------------------------------------------------------------------
// Schema mode — the shape actually in use
// ---------------------------------------------------------------------------

test('1. a gym resolves to a client scoped to ITS OWN schema', async () => {
  const r = await resolveGym('iron-works', deps());

  assert.equal(r.gym.id, 'gym-a');
  assert.equal(r.client.schema, 'gym_ironworks');
  assert.equal(r.client.url, SHARED.url, 'schema mode shares the project');
});

test('2. two gyms in the same project get DIFFERENT schemas', async () => {
  const d = deps();
  const a = await resolveGym('iron-works', d);
  const b = await resolveGym('flex-house', d);

  assert.notEqual(a.client, b.client);
  assert.equal(a.client.schema, 'gym_ironworks');
  assert.equal(b.client.schema, 'gym_flexhouse');
  assert.notEqual(a.client.schema, b.client.schema, 'the schema IS the isolation boundary');
});

test('3. a connection with no schema is REFUSED — never the default', async () => {
  // The dangerous case: falling back to 'gym' would serve the original gym's
  // data to whoever asked. Fail closed instead.
  const d = deps();
  await assert.rejects(
    () => resolveGym('no-schema', d),
    (err) => err instanceof ResolutionError && err.status === 503
  );
  assert.equal(d.built.length, 0, 'no client may be built without a schema');
});

// ---------------------------------------------------------------------------
// Project mode — still supported, for a gym with its own account
// ---------------------------------------------------------------------------

test('4. a gym with its own project uses its own url and key', async () => {
  const r = await resolveGym('own-project', deps());

  assert.equal(r.client.url, 'https://own.supabase.co');
  assert.equal(r.client.key, 'own-key');
  assert.equal(r.client.schema, 'gym');
});

test('5. a gym with its own project but no credentials fails closed', async () => {
  const d = deps({ secretFails: true });
  await assert.rejects(
    () => resolveGym('own-project', d),
    (err) => err instanceof ResolutionError && err.status === 503
  );
  assert.equal(d.built.length, 0, 'never fall back to the shared project');
});

// ---------------------------------------------------------------------------
// Refusals — every failure fails closed
// ---------------------------------------------------------------------------

test('6. unknown, suspended, unpaid and unreachable gyms are all refused', async () => {
  const d = deps();

  await assert.rejects(() => resolveGym('does-not-exist', d), (e) => e.status === 404);
  await assert.rejects(() => resolveGym('suspended', d), (e) => e.status === 403);
  await assert.rejects(() => resolveGym('trial-over', d), (e) => e.status === 402);
  await assert.rejects(() => resolveGym('unreachable', d), (e) => e.status === 503);

  assert.equal(d.built.length, 0, 'a refused gym never gets a client');
});

// ---------------------------------------------------------------------------
// The ones that matter most now that isolation is logical
// ---------------------------------------------------------------------------

test('7. concurrent requests for two gyms never cross schemas', async () => {
  // gym-a is slowed so the requests interleave. If the resolved gym were held
  // anywhere shared, the fast request would overwrite the slow one.
  const d = deps({ delayFor: 'gym-a' });
  const seen = [];

  const one = async (slug, expectedSchema) => {
    const r = await resolveGym(slug, d);
    return runWithGym(r, async () => {
      await new Promise((res) => setTimeout(res, 5));
      const ctx = currentGym();
      seen.push([slug, ctx.client.schema]);
      assert.equal(ctx.client.schema, expectedSchema, `${slug} must still see its own schema`);
    });
  };

  await Promise.all([
    one('iron-works', 'gym_ironworks'),
    one('flex-house', 'gym_flexhouse'),
    one('iron-works', 'gym_ironworks'),
    one('flex-house', 'gym_flexhouse'),
  ]);

  assert.equal(seen.length, 4);
  for (const [slug, schema] of seen) {
    assert.equal(schema, slug === 'iron-works' ? 'gym_ironworks' : 'gym_flexhouse');
  }
});

test('8. outside a request context there is no ambient gym', () => {
  // Nothing may leak between requests via module state.
  assert.equal(currentGym(), undefined);
});

test('9. a schema name that is not a plain identifier is refused', async () => {
  // The schema name reaches a database client. Anything that is not a simple
  // identifier is refused rather than sanitised, because a registry row should
  // never contain such a thing in the first place.
  const d = deps();
  d.lookupGym = async () => ({
    gym: { id: 'gym-evil', slug: 'evil', status: 'active' },
    connection: { id: 'c', schema_name: 'gym_a"; drop schema gym_b; --', status: 'healthy' },
  });

  await assert.rejects(
    () => resolveGym('evil', d),
    (err) => err instanceof ResolutionError && err.status === 503
  );
  assert.equal(d.built.length, 0);
});
