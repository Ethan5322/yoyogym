// The platform controls the gym at the main address too (CLAUDE.md §40.1 Q1).
//
// Before this, a request that named no gym never met the registry: suspending
// KOM on the platform locked /g/kom/ and nothing else. These tests pin the new
// rule — a suspension or an unpaid state is enforced at the main address, and
// a registry FAULT never locks a working gym out.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET ||= 'test-only-gym-secret';

const { withGym } = await import('../server/lib/gymcontext.js');
const { currentGym } = await import('../server/lib/tenancy.js');
const { signToken } = await import('../server/lib/auth.js');

const PRIME = { key: 'prime', features: ['members', 'checkin'], max_active_members: 500 };

function registry({ home = 'kom', status = 'active', connection = 'healthy', lookup = null } = {}) {
  return {
    homeGymSlug: async () => home,
    lookupGym:
      lookup ||
      (async (slug) => ({
        gym: { id: 'g1', slug, status, plan_key: 'prime', search_name: 'KOM' },
        connection: { gym_id: 'g1', schema_name: 'gym', supabase_url: null, status: connection },
        plan: PRIME,
      })),
    fetchSecrets: async () => ({}),
    createClient: () => ({ fake: true }),
    shared: { url: 'https://example.supabase.co', key: 'service' },
  };
}

/** Run withGym once; report what the handler saw and what was answered. */
async function call(tenancy, headers = {}) {
  const out = { ran: false, gym: undefined, status: null, body: null };
  const json = (res, status, body) => {
    out.status = status;
    out.body = body;
  };
  await withGym({ headers }, {}, () => {
    out.ran = true;
    out.gym = currentGym();
  }, json, { tenancy });
  return out;
}

test('A SUSPENDED gym is locked at the main address, not only at /g/kom/', async () => {
  const out = await call(registry({ status: 'suspended' }));
  assert.equal(out.ran, false, 'the handler must not run');
  assert.equal(out.status, 403);
  assert.match(out.body.error, /not active/);
});

test('a gym not yet active (pending) is refused with 402 at the main address', async () => {
  const out = await call(registry({ status: 'pending' }));
  assert.equal(out.ran, false);
  assert.equal(out.status, 402);
});

test('an ACTIVE gym at the main address runs as itself, with its plan', async () => {
  const out = await call(registry());
  assert.equal(out.ran, true);
  assert.equal(out.gym.gym.slug, 'kom');
  assert.deepEqual(out.gym.features, PRIME.features);
  assert.equal(out.gym.plan.maxActiveMembers, 500);
});

test('a sign-in from before (a token with no gym in it) still reaches the gym at the main address', async () => {
  const token = signToken({ id: 'a1', username: 'owner', role: 'owner', full_name: 'Owner' });
  const out = await call(registry(), { authorization: `Bearer ${token}` });
  assert.equal(out.ran, true, 'nobody is signed out by this change');
  assert.equal(out.gym.gym.slug, 'kom');
});

test('a deployment the registry does not know runs exactly as before', async () => {
  const out = await call(registry({ home: null }));
  assert.equal(out.ran, true);
  assert.equal(out.gym, undefined, 'no gym in scope: single-gym mode, nothing gated');
});

test('FAILS OPEN on a fault: a registry that cannot be read never locks the gym out', async () => {
  const out = await call(registry({ lookup: async () => { throw new Error('network down'); } }));
  assert.equal(out.ran, true);
  assert.equal(out.status, null);
});

test('fails open when the connection is marked unreachable — a fault, not a decision', async () => {
  const out = await call(registry({ connection: 'degraded' }));
  assert.equal(out.ran, true);
  assert.equal(out.status, null);
});

test('with no registry access at all (no homeGymSlug), the gym serves as before', async () => {
  const out = await call({});
  assert.equal(out.ran, true);
});
