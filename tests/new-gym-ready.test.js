// CLAUDE.md §45 — a new gym that can take members, and a platform whose
// Settings page is green because things WORK, not because a variable exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.JWT_SECRET ||= 'test-only-gym-secret';
process.env.PLATFORM_JWT_SECRET ||= 'test-only-platform-secret-distinct';
process.env.SUPABASE_MANAGEMENT_TOKEN ||= 'test-only';
process.env.SUPABASE_PROJECT_REF ||= 'test-ref';

import { planPriceMissing, PRICE_FIELD } from '../shared/pricing.js';
import { starterPlansSql, schemaRunnerDeps } from '../platform/schema-runner.js';
import { runPlatformNightly } from '../server/lib/platform-nightly.js';
import { handlePlatform } from '../platform/router.js';
import { sessionCookie } from '../platform/http.js';
import { fakeDb } from './fake-db.js';
import { runWithGym } from '../server/lib/tenancy.js';

const { default: plansHandler } = await import('../server/handlers/admin/plans.js');
const { signToken } = await import('../server/lib/auth.js');

// ---------------------------------------------------------------------------
// Q1 — starter plans, and nothing sold without a price
// ---------------------------------------------------------------------------

test('each kind of plan is priced by the field sign-up charges', () => {
  assert.deepEqual(PRICE_FIELD, { full: 'monthly_price', session_pack: 'session_pack_price', day_pass: 'day_pass_price', trial: 'trial_price' });
  assert.equal(planPriceMissing({ visit_type: 'full', monthly_price: null }), true);
  assert.equal(planPriceMissing({ visit_type: 'full', monthly_price: 0 }), false, 'zero is a price: a deliberate free plan');
  assert.equal(planPriceMissing({ visit_type: 'day_pass', monthly_price: 300, day_pass_price: null }), true, 'a day pass sells at its day price');
  assert.equal(planPriceMissing({ visit_type: 'session_pack', session_pack_price: 900 }), false);
  assert.equal(planPriceMissing({ visit_type: 'trial', trial_price: 0 }), false);
});

test("KOM'S NINE PLANS ARE ALL STILL SOLD — the new filter hides none of them", () => {
  // The shapes read from KOM's catalog on 2026-09-29 (which price fields are set).
  const kom = [
    ...['Basic', 'Standard', 'Premium', 'VIP / Elite'].map((name) => ({ name, visit_type: 'full', monthly_price: 1 })),
    ...[5, 10, 20].map((n) => ({ name: `${n} Session Pack`, visit_type: 'session_pack', monthly_price: 1, session_pack_price: 1 })),
    { name: 'Day Pass', visit_type: 'day_pass', monthly_price: 1, day_pass_price: 1 },
    { name: '7-Day Trial', visit_type: 'trial', monthly_price: 1, trial_price: 1 },
  ];
  assert.deepEqual(kom.filter(planPriceMissing), []);
});

test('a new gym starts with starter plans — OFF, UNPRICED, and only into an empty catalog', () => {
  const sql = starterPlansSql('gym_cocate_gym');
  assert.match(sql, /insert into gym_cocate_gym\.plans/);
  assert.match(sql, /'Monthly membership', 'standard', 'full'/);
  assert.match(sql, /'Day Pass', null, 'day_pass'/);
  assert.equal((sql.match(/, false, \d\)/g) || []).length, 2, 'both switched off');
  assert.doesNotMatch(sql, /price/, 'no price is invented');
  assert.match(sql, /where not exists \(select 1 from gym_cocate_gym\.plans\)/, 'a retried build never adds them twice');
  assert.throws(() => starterPlansSql('gym; drop'), /Unsafe schema name/);
});

test('building a gym seeds its profile AND its starter plans', async () => {
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { sent.push(JSON.parse(init.body).query); return { ok: true, json: async () => ({}) }; };
  try {
    await schemaRunnerDeps().seed('gym_new_gym', { proposed_gym_name: 'NEW GYM', city: 'Durban', country: 'ZA' });
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(sent.length, 2);
  assert.match(sent[1], /insert into gym_new_gym\.plans/);
});

function adminReq(method, url, body) {
  const token = signToken({ id: 'o1', username: 'owner', role: 'owner', full_name: 'Owner' });
  return { method, url, headers: { authorization: `Bearer ${token}` }, body };
}
function res() {
  return {
    statusCode: 200, headers: {}, body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    writeHead(code, h) { this.statusCode = code; Object.assign(this.headers, h || {}); return this; },
    end(b) { this.body = b || ''; return this; },
    status(code) { this.statusCode = code; return this; },
    json(o) { this.body = JSON.stringify(o); return this; },
  };
}
async function asGym(db, fn) {
  return runWithGym({ schema: 'gym_cocate_gym', gym: { slug: 'cocate-gym' }, client: db }, fn);
}

test('SWITCHING ON A PLAN WITH NO PRICE IS REFUSED, and says why', async () => {
  const db = fakeDb({ plans: [{ id: 'p1', name: 'Day Pass', visit_type: 'day_pass', day_pass_price: null, is_enabled: false }] });
  const r = res();
  await asGym(db, () => plansHandler(adminReq('PATCH', '/api/admin/plans?id=p1', { is_enabled: true }), r));
  assert.equal(r.statusCode, 400);
  assert.match(r.body, /Set this plan's price before switching it on/);
  assert.equal(db.tables.plans[0].is_enabled, false);
});

test('with its price, the same plan switches on', async () => {
  const db = fakeDb({ plans: [{ id: 'p1', name: 'Day Pass', visit_type: 'day_pass', day_pass_price: null, is_enabled: false }] });
  const r = res();
  await asGym(db, () => plansHandler(adminReq('PATCH', '/api/admin/plans?id=p1', { day_pass_price: 80, is_enabled: true }), r));
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(db.tables.plans[0].is_enabled, true);
  assert.equal(db.tables.plans[0].day_pass_price, 80);
});

test('the Catalog screen offers the RIGHT price for each kind of plan, and never turns blank into R0', () => {
  const src = readFileSync(new URL('../src/pages/admin/Catalog.jsx', import.meta.url), 'utf8');
  assert.match(src, /day_pass: \[\['day_pass_price', 'Day pass price'\]\]/);
  assert.match(src, /session_pack: \[\['session_pack_size'/);
  assert.doesNotMatch(src, /monthly_price: Number\(planForm\.monthly_price\)/, 'Number("") is 0');
  assert.match(src, /setFormError\(e\.message/, 'a refusal is shown in the form');
});

test('the public catalog never lists a plan with no price, whatever its switch says', () => {
  const src = readFileSync(new URL('../server/handlers/public/catalog.js', import.meta.url), 'utf8');
  assert.match(src, /\(plans \|\| \[\]\)\.filter\(\(p\) => !planPriceMissing\(p\)\)/);
});

// ---------------------------------------------------------------------------
// The nightly job actually runs, and the Settings page says when
// ---------------------------------------------------------------------------

test('THE PLATFORM NIGHTLY JOB IS CALLED FROM THE MORNING RUN, with its own secret, in production only', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, auth: init.headers.Authorization }); return { ok: true, status: 200 }; };
  const out = await runPlatformNightly({ PLATFORM_CRON_SECRET: 's3cret', VERCEL_PROJECT_PRODUCTION_URL: 'yoyogym.vercel.app', VERCEL_ENV: 'production' }, fetchImpl);
  assert.deepEqual(calls, [{ url: 'https://yoyogym.vercel.app/api/platform/cron', auth: 'Bearer s3cret' }]);
  assert.equal(out.ok, true);

  const preview = await runPlatformNightly({ PLATFORM_CRON_SECRET: 's', VERCEL_PROJECT_PRODUCTION_URL: 'x', VERCEL_ENV: 'preview' }, fetchImpl);
  assert.equal(preview.skipped, 'not production', 'the preview shares the database: it never bills');
  assert.equal(calls.length, 1);
  assert.match((await runPlatformNightly({}, fetchImpl)).skipped, /PLATFORM_CRON_SECRET/);
});

test('the morning cron route runs it after every gym', () => {
  const src = readFileSync(new URL('../api/cron/[...path].js', import.meta.url), 'utf8');
  assert.match(src, /seg === 'daily' \? await runPlatformNightly\(\)/);
});

async function settingsPage(lastRun) {
  const r = res();
  const q = { method: 'GET', url: '/platform/settings', headers: { cookie: sessionCookie({ id: 'staff-1', email: 's@y', kind: 'platform_staff' }).split(';')[0] } };
  const saved = process.env.PLATFORM_CRON_SECRET;
  process.env.PLATFORM_CRON_SECRET = 'set';
  try {
    await handlePlatform(q, r, {
      audit: async () => {},
      permissionsFor: async () => ['platform.manage'],
      listAuditLog: async ({ action }) => (action === 'platform.cron.ran' && lastRun ? [{ created_at: lastRun }] : []),
      getSupportContacts: async () => ({ email: 'hello@mulesoo.com', whatsapp: '' }),
    });
  } finally {
    if (saved === undefined) delete process.env.PLATFORM_CRON_SECRET; else process.env.PLATFORM_CRON_SECRET = saved;
  }
  return r.body;
}

test('"Nightly job" is green only when it has RUN lately — not merely because its secret exists', async () => {
  const never = await settingsPage(null);
  assert.match(never, /set, but has not run yet/);
  const recent = await settingsPage(new Date(Date.now() - 2 * 3_600_000).toISOString());
  assert.match(recent, /ran \d{4}-\d\d-\d\d \d\d:\d\d UTC/);
  const stale = await settingsPage(new Date(Date.now() - 50 * 3_600_000).toISOString());
  assert.match(stale, /overdue/);
});

test('every run of the platform nightly job is recorded', () => {
  const src = readFileSync(new URL('../platform/router.js', import.meta.url), 'utf8');
  assert.match(src, /action: 'platform\.cron\.ran'/);
});

test('"Shared rate limits" says whether Upstash is connected — names only, never a value (CLAUDE.md §46.1 Q2)', async () => {
  const saved = [process.env.UPSTASH_REDIS_REST_URL, process.env.UPSTASH_REDIS_REST_TOKEN];
  try {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    const off = await settingsPage(null);
    assert.match(off, /Shared rate limits/);
    assert.match(off, /not set — limits count on each server separately/);

    process.env.UPSTASH_REDIS_REST_URL = 'https://example-upstash.invalid';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'secret-token-value';
    const on = await settingsPage(null);
    assert.doesNotMatch(on, /not set — limits count on each server separately/);
    assert.doesNotMatch(on, /secret-token-value|example-upstash/, 'the value is never shown');
  } finally {
    if (saved[0] === undefined) delete process.env.UPSTASH_REDIS_REST_URL; else process.env.UPSTASH_REDIS_REST_URL = saved[0];
    if (saved[1] === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN; else process.env.UPSTASH_REDIS_REST_TOKEN = saved[1];
  }
});
