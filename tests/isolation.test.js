// Tenant-isolation tests — the Stage 5 gate, written BEFORE the resolver.
//
// The rule these defend: "Gym 1 must not see Gym 2 data." Under the chosen
// architecture (a shared application over a database per gym) the resolver
// replaces RLS as the isolation mechanism, so a bug here is a cross-tenant leak
// of health and biometric data.
//
// Test 6 is the important one. Cache-key confusion under concurrency is how
// this design fails, and it is invisible in single-request testing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveGym, runWithGym, currentGym, ResolutionError } from '../server/lib/tenancy.js';

/** Two gyms, two databases, two secrets — the whole point of the design. */
const REGISTRY = {
  'iron-works': {
    gym: { id: 'gym-a', slug: 'iron-works', status: 'active' },
    connection: { id: 'conn-a', supabase_url: 'https://a.supabase.co', schema_name: 'gym', status: 'healthy' },
  },
  'flex-house': {
    gym: { id: 'gym-b', slug: 'flex-house', status: 'active' },
    connection: { id: 'conn-b', supabase_url: 'https://b.supabase.co', schema_name: 'gym', status: 'healthy' },
  },
  suspended: {
    gym: { id: 'gym-c', slug: 'suspended', status: 'suspended' },
    connection: { id: 'conn-c', supabase_url: 'https://c.supabase.co', schema_name: 'gym', status: 'healthy' },
  },
  'trial-over': {
    gym: { id: 'gym-d', slug: 'trial-over', status: 'pending' },
    connection: { id: 'conn-d', supabase_url: 'https://d.supabase.co', schema_name: 'gym', status: 'healthy' },
  },
  unreachable: {
    gym: { id: 'gym-e', slug: 'unreachable', status: 'active' },
    connection: { id: 'conn-e', supabase_url: 'https://e.supabase.co', schema_name: 'gym', status: 'unreachable' },
  },
};

const SECRETS = {
  'gym-a': { service_key: 'key-a', jwt_secret: 'jwt-a' },
  'gym-b': { service_key: 'key-b', jwt_secret: 'jwt-b' },
};

function deps({ secretFails = false, delayFor = null } = {}) {
  const built = [];
  return {
    built,
    lookupGym: async (slug) => REGISTRY[slug] ?? null,
    fetchSecrets: async (gymId) => {
      if (secretFails) throw new Error('secrets store unavailable');
      // Deliberate skew so a slow gym cannot be masked by a fast one.
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

test('1. resolves a gym to a client built from ITS OWN url and key', async () => {
  const d = deps();
  const r = await resolveGym('iron-works', d);

  assert.equal(r.gym.id, 'gym-a');
  assert.equal(r.client.url, 'https://a.supabase.co');
  assert.equal(r.client.key, 'key-a');
});

test('2. two gyms never share a client', async () => {
  const d = deps();
  const a = await resolveGym('iron-works', d);
  const b = await resolveGym('flex-house', d);

  assert.notEqual(a.client, b.client);
  assert.equal(a.client.key, 'key-a');
  assert.equal(b.client.key, 'key-b');
  assert.notEqual(a.secrets.jwt_secret, b.secrets.jwt_secret, 'each gym signs with its own secret');
});

test('3. an unknown gym is refused — never a default', async () => {
  const d = deps();
  await assert.rejects(
    () => resolveGym('does-not-exist', d),
    (err) => err instanceof ResolutionError && err.status === 404
  );
  assert.equal(d.built.length, 0, 'no client may be built for an unknown gym');
});

test('4. suspended and not-yet-paid gyms are refused, with valid credentials present', async () => {
  const d = deps();
  await assert.rejects(
    () => resolveGym('suspended', d),
    (err) => err instanceof ResolutionError && err.status === 403
  );
  await assert.rejects(
    () => resolveGym('trial-over', d),
    (err) => err instanceof ResolutionError && err.status === 402
  );
  assert.equal(d.built.length, 0, 'a refused gym must never get a client');
});

test('5. an unreachable connection or a failed secret fetch fails closed', async () => {
  await assert.rejects(
    () => resolveGym('unreachable', deps()),
    (err) => err instanceof ResolutionError && err.status === 503
  );

  const failing = deps({ secretFails: true });
  await assert.rejects(
    () => resolveGym('iron-works', failing),
    (err) => err instanceof ResolutionError && err.status === 503
  );
  assert.equal(failing.built.length, 0, 'never fall back to another gym when secrets fail');
});

test('6. concurrent requests for two gyms never cross over', async () => {
  // gym-a is deliberately slowed so the requests interleave. If the resolved
  // gym were held anywhere shared, the fast request would overwrite the slow
  // one and this test would see gym-b's client inside gym-a's context.
  const d = deps({ delayFor: 'gym-a' });
  const seen = [];

  const one = async (slug, expectedKey) => {
    const r = await resolveGym(slug, d);
    return runWithGym(r, async () => {
      await new Promise((res) => setTimeout(res, 5));
      const ctx = currentGym();
      seen.push([slug, ctx.client.key]);
      assert.equal(ctx.client.key, expectedKey, `${slug} must still see its own client`);
    });
  };

  await Promise.all([
    one('iron-works', 'key-a'),
    one('flex-house', 'key-b'),
    one('iron-works', 'key-a'),
    one('flex-house', 'key-b'),
  ]);

  assert.equal(seen.length, 4);
  for (const [slug, key] of seen) {
    assert.equal(key, slug === 'iron-works' ? 'key-a' : 'key-b');
  }
});

test('7. outside a request context there is no ambient gym', () => {
  // Nothing may leak between requests via module state.
  assert.equal(currentGym(), undefined);
});
