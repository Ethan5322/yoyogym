// Found evaluating the first live gym after it was built (2026-09-29):
//
//  1. The scheduled jobs ran for the deployment's own gym (KOM) only, so a
//     second gym's memberships never expired and its pauses never ended.
//  2. A gym that had not typed its own owner contacts sent its owner alerts —
//     new members' names and phones, payments, PAR-Q health flags — to KOM's
//     owner, whose contacts are the server's environment variables.
//  3. A new gym's profile was seeded under a key nothing reads, so it had no
//     name of its own.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET ||= 'test-only-gym-secret';
process.env.SUPABASE_MANAGEMENT_TOKEN ||= 'test-only';
process.env.SUPABASE_PROJECT_REF ||= 'test-ref';

import { forEveryGym } from '../server/lib/every-gym.js';
import { runWithGym } from '../server/lib/tenancy.js';
import { servingHomeGym, notifyOwner } from '../server/lib/notify/index.js';
import { schemaRunnerDeps } from '../platform/schema-runner.js';

function registry(gyms, { home = 'kom', fail = false } = {}) {
  return {
    servingGymSlugs: async () => {
      if (fail) throw new Error('registry down');
      return gyms.map((g) => g.slug);
    },
    homeGymSlug: async () => home,
    lookupGym: async (slug) => {
      const gym = gyms.find((g) => g.slug === slug);
      return gym
        ? { gym: { id: `id-${slug}`, slug, status: 'active', search_name: slug.toUpperCase() }, connection: { schema_name: gym.schema, status: 'healthy' }, plan: { key: 'basic', features: [] } }
        : null;
    },
    shared: { url: 'https://x.supabase.co', key: 'k' },
    createClient: (url, key, opts) => ({ schema: opts.db.schema }),
  };
}

// ---------------------------------------------------------------------------
// 1. Every gym gets its scheduled jobs
// ---------------------------------------------------------------------------

test('A SCHEDULED JOB RUNS FOR EVERY GYM, each against its own schema', async () => {
  const seen = [];
  const results = await forEveryGym(async (supabase) => {
    seen.push(supabase.schema);
    return { ok: true };
  }, { tenancy: registry([{ slug: 'kom', schema: 'gym' }, { slug: 'cocate-gym', schema: 'gym_cocate_gym' }]) });

  assert.deepEqual(seen, ['gym', 'gym_cocate_gym']);
  assert.deepEqual(Object.keys(results), ['kom', 'cocate-gym']);
});

test('one gym failing does not stop the next', async () => {
  const results = await forEveryGym(async (supabase) => {
    if (supabase.schema === 'gym') throw new Error('KOM exploded');
    return { ok: true };
  }, { tenancy: registry([{ slug: 'kom', schema: 'gym' }, { slug: 'cocate-gym', schema: 'gym_cocate_gym' }]) });

  assert.match(results.kom.error, /KOM exploded/);
  assert.deepEqual(results['cocate-gym'], { ok: true });
});

test('with the registry unreadable, the home gym still gets its jobs (fail open)', async () => {
  // The home gym is the deployment's default connection; a client is only
  // created here, nothing is queried.
  const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  process.env.SUPABASE_URL ||= 'https://home.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-only';
  try {
    let ran = 0;
    const results = await forEveryGym(async () => { ran += 1; return { ok: true }; }, { tenancy: registry([], { fail: true }) });
    assert.equal(ran, 1);
    assert.deepEqual(Object.keys(results), ['home']);
  } finally {
    if (saved.url === undefined) delete process.env.SUPABASE_URL;
    if (saved.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
});

// ---------------------------------------------------------------------------
// 2. One gym's alerts never go to another gym's owner
// ---------------------------------------------------------------------------

function gymDb({ settings = [], owners = [] } = {}) {
  const sent = [];
  const chain = (table) => {
    const q = {
      select() { return q; }, in() { return q; }, eq() { return q; }, not() { return q; }, limit() { return q; },
      maybeSingle: async () => ({ data: table === 'admin_users' ? owners[0] ?? null : null }),
      insert: async (row) => { sent.push(row); return {}; },
      then(resolve) { return Promise.resolve({ data: table === 'settings' ? settings : [] }).then(resolve); },
    };
    return q;
  };
  return { from: chain, sent };
}

test('the server environment is the HOME gym\'s — only it may use those contacts', () => {
  assert.equal(servingHomeGym(), true, 'no gym in scope: the deployment\'s own');
  runWithGym({ schema: 'gym', gym: { slug: 'kom' } }, () => assert.equal(servingHomeGym(), true));
  runWithGym({ schema: 'gym_cocate_gym', gym: { slug: 'cocate-gym' } }, () => assert.equal(servingHomeGym(), false));
});

test("A NEW GYM'S OWNER ALERT NEVER GOES TO KOM'S OWNER", async () => {
  const saved = { ...process.env };
  process.env.OWNER_EMAIL = 'kom-owner@example.com';
  process.env.CALLMEBOT_WHATSAPP_PHONE = '+27000000001';
  process.env.CALLMEBOT_WHATSAPP_APIKEY = 'kom-key';
  process.env.CALLMEBOT_TELEGRAM_USERNAME = 'kom_owner';
  delete process.env.BREVO_API_KEY; // nothing leaves the test; the log shows who it WOULD go to
  try {
    const db = gymDb({ owners: [] });
    await runWithGym({ schema: 'gym_cocate_gym', gym: { slug: 'cocate-gym', search_name: 'COCATE GYM' } }, () =>
      notifyOwner(db, 'new_member', 'New member: Jane, 082…')
    );
    const recipients = db.sent.map((r) => r.recipient);
    for (const kom of ['kom-owner@example.com', '+27000000001', 'kom_owner']) {
      assert.ok(!recipients.includes(kom), `never ${kom}`);
    }
  } finally {
    process.env = saved;
  }
});

test("KOM, the home gym, keeps using the environment's contacts as before", async () => {
  const saved = { ...process.env };
  process.env.CALLMEBOT_WHATSAPP_PHONE = '+27000000001';
  process.env.CALLMEBOT_WHATSAPP_APIKEY = 'kom-key';
  try {
    const db = gymDb();
    // The WhatsApp send itself fails in a test (no network); the log still
    // records the attempt, and its recipient.
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: false, status: 500, text: async () => '' });
    try {
      await runWithGym({ schema: 'gym', gym: { slug: 'kom' } }, () => notifyOwner(db, 'new_member', 'New member'));
    } finally {
      globalThis.fetch = realFetch;
    }
    assert.ok(db.sent.some((r) => r.recipient === '+27000000001'));
  } finally {
    process.env = saved;
  }
});

// ---------------------------------------------------------------------------
// 3. A new gym has its own name
// ---------------------------------------------------------------------------

test("a new gym's profile is seeded under `name`, the key the app reads — and a retry keeps what was saved", async () => {
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { sent.push(JSON.parse(init.body).query); return { ok: true, json: async () => ({}) }; };
  try {
    await schemaRunnerDeps().seed('gym_cocate_gym', { proposed_gym_name: "COCATE'S GYM", city: 'Durban', country: 'ZA' });
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.match(sent[0], /"name":"COCATE''S GYM"/, 'the key the app reads, quote escaped');
  assert.doesNotMatch(sent[0], /"gym_name"/);
  assert.match(sent[0], /on conflict \(key\) do update set value = excluded\.value \|\| gym_cocate_gym\.settings\.value/);
});
