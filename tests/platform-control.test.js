// The half of the platform panel that controls the tenant gyms.
//
// The application queue and the registry were built first because they are the
// visible half. These are the ones that decide whether the platform can
// actually be run: set the prices (without which billing charges nothing at
// all), read the audit log (which everything writes to and nothing could read),
// find a gym among ten thousand, and switch off an owner account.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.PLATFORM_JWT_SECRET ||= 'test-only-platform-secret-distinct';

import { handlePlatform } from '../platform/router.js';
import { sessionCookie, issueCsrfToken } from '../platform/http.js';

const STAFF = { id: 'staff-1', email: 'me@yoyogyms.com', kind: 'platform_staff' };
const session = () => sessionCookie(STAFF).split(';')[0];
const csrf = () => encodeURIComponent(issueCsrfToken('staff-1'));

function req({ method = 'GET', url = '', cookie = '', body = '' } = {}) {
  const r = {
    method, url,
    headers: { ...(cookie ? { cookie } : {}), 'content-type': 'application/x-www-form-urlencoded' },
    _body: body,
  };
  r[Symbol.asyncIterator] = async function* () { if (r._body) yield Buffer.from(r._body); };
  return r;
}

function res() {
  return {
    statusCode: 200, headers: {}, body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    getHeader(k) { return this.headers[k.toLowerCase()]; },
    writeHead(code, h) {
      this.statusCode = code;
      for (const [k, v] of Object.entries(h || {})) this.headers[k.toLowerCase()] = v;
      return this;
    },
    end(b) { this.body = b || ''; this.ended = true; return this; },
  };
}

const PLANS = [
  { id: 'p1', key: 'basic', label: 'Basic', price_cents: null, currency: 'ZAR', max_active_members: 40, is_enabled: true },
  { id: 'p2', key: 'prime', label: 'Prime', price_cents: 99900, currency: 'ZAR', max_active_members: 500, is_enabled: true },
];

function deps({ permissions = [] } = {}) {
  const calls = { plans: [], owners: [], audits: [], queries: [] };
  return {
    calls,
    permissionsFor: async () => permissions,
    audit: async (a) => { calls.audits.push(a); },
    listPlans: async () => PLANS,
    updatePlan: async (key, patch) => { calls.plans.push({ key, ...patch }); },
    listAuditLog: async (filter) => {
      calls.queries.push(filter);
      return [{ id: 'e1', action: 'platform.gym.suspended', actor_kind: 'platform_staff', entity_id: 'gym-1', created_at: '2026-09-22T10:00:00Z', detail: { reason: 'unpaid' } }];
    },
    listGyms: async (filter) => { calls.queries.push(filter); return []; },
    listOwners: async (filter) => {
      calls.queries.push(filter);
      return [{ id: 'o1', email: 'ann@bos.co', full_name: 'Ann', is_active: true, gym_count: 1 }];
    },
    setOwnerActive: async (id, active) => { calls.owners.push({ id, active }); },
    financeSummary: async () => ({
      currency: 'ZAR',
      paid_cents: 199800, outstanding_cents: 49900,
      gyms_by_status: { active: 12, trialing: 3, past_due: 1, suspended: 2 },
      unpriced_plans: ['basic'],
    }),
  };
}

// ---------------------------------------------------------------------------
// Plans and prices — without this, billing charges nothing
// ---------------------------------------------------------------------------

test('the plans screen needs subscription.manage, not just a session', async () => {
  const r = res();
  await handlePlatform(req({ url: '/platform/plans', cookie: session() }), r, deps({ permissions: ['gym.view'] }));
  assert.equal(r.statusCode, 403);
});

test('the plans screen SAYS OUT LOUD when a plan has no price', async () => {
  // A null price is not free — it means billing silently skips that plan. A
  // screen that shows a blank box gives no hint that nobody is being charged.
  const r = res();
  await handlePlatform(req({ url: '/platform/plans', cookie: session() }), r, deps({ permissions: ['subscription.manage'] }));

  assert.equal(r.statusCode, 200);
  assert.match(r.body, /Basic/);
  assert.match(r.body, /no price/i, 'the unpriced plan is called out');
  assert.match(r.body, /999\.00/, 'and a set price is shown in rands, not cents');
});

test('a price is stored in CENTS, however it is typed', async () => {
  // The form takes rands because that is what a person thinks in. Everything
  // below stores cents. Getting this wrong by 100x is the classic billing bug.
  const d = deps({ permissions: ['subscription.manage'] });
  const r = res();

  await handlePlatform(
    req({ method: 'POST', url: '/platform/plans/basic', cookie: session(),
          body: `price=499.50&max_active_members=40&csrf=${csrf()}` }),
    r, d
  );

  assert.equal(d.calls.plans[0].price_cents, 49950);
  assert.equal(r.statusCode, 302);
});

test('a price of zero is refused rather than stored as free', async () => {
  const d = deps({ permissions: ['subscription.manage'] });
  const r = res();

  await handlePlatform(
    req({ method: 'POST', url: '/platform/plans/basic', cookie: session(),
          body: `price=0&max_active_members=40&csrf=${csrf()}` }),
    r, d
  );

  assert.equal(r.statusCode, 400);
  assert.equal(d.calls.plans.length, 0);
});

test('a nonsense price is refused, not coerced', async () => {
  const d = deps({ permissions: ['subscription.manage'] });
  const r = res();

  await handlePlatform(
    req({ method: 'POST', url: '/platform/plans/basic', cookie: session(),
          body: `price=abc&max_active_members=40&csrf=${csrf()}` }),
    r, d
  );

  assert.equal(r.statusCode, 400);
  assert.equal(d.calls.plans.length, 0);
});

test('changing a price is audited — it decides what every gym pays', async () => {
  const d = deps({ permissions: ['subscription.manage'] });
  const r = res();

  await handlePlatform(
    req({ method: 'POST', url: '/platform/plans/basic', cookie: session(),
          body: `price=499.00&max_active_members=40&csrf=${csrf()}` }),
    r, d
  );

  assert.ok(d.calls.audits.some((a) => a.action === 'platform.plan.updated'));
});

test('a price change without a CSRF token is refused', async () => {
  const d = deps({ permissions: ['subscription.manage'] });
  const r = res();

  await handlePlatform(
    req({ method: 'POST', url: '/platform/plans/basic', cookie: session(), body: 'price=1.00' }),
    r, d
  );

  assert.equal(r.statusCode, 403);
  assert.equal(d.calls.plans.length, 0);
});

// ---------------------------------------------------------------------------
// The audit log — everything wrote to it, nothing could read it
// ---------------------------------------------------------------------------

test('the audit log needs audit.view', async () => {
  const r = res();
  await handlePlatform(req({ url: '/platform/audit', cookie: session() }), r, deps({ permissions: ['gym.view'] }));
  assert.equal(r.statusCode, 403);
});

test('the audit log renders entries, and escapes what people typed', async () => {
  const d = {
    ...deps({ permissions: ['audit.view'] }),
    listAuditLog: async () => [
      { id: 'e1', action: 'platform.gym.suspended', actor_kind: 'platform_staff', created_at: '2026-09-22T10:00:00Z', detail: { reason: '<script>alert(1)</script>' } },
    ],
  };
  const r = res();
  await handlePlatform(req({ url: '/platform/audit', cookie: session() }), r, d);

  assert.equal(r.statusCode, 200);
  assert.match(r.body, /platform\.gym\.suspended/);
  assert.ok(!r.body.includes('<script>alert(1)</script>'), 'a typed reason is escaped');
});

test('the audit log can be filtered, so it is usable after a year of entries', async () => {
  const d = deps({ permissions: ['audit.view'] });
  const r = res();

  await handlePlatform(req({ url: '/platform/audit?action=suspend&entity_id=gym-1', cookie: session() }), r, d);

  assert.equal(d.calls.queries[0].action, 'suspend');
  assert.equal(d.calls.queries[0].entityId, 'gym-1');
});

// ---------------------------------------------------------------------------
// Finding things among ten thousand
// ---------------------------------------------------------------------------

test('the registry passes a search term through', async () => {
  const d = deps({ permissions: ['gym.view'] });
  const r = res();

  await handlePlatform(req({ url: '/platform/registry?q=BOS&status=suspended', cookie: session() }), r, d);

  assert.equal(d.calls.queries[0].query, 'BOS');
  assert.equal(d.calls.queries[0].status, 'suspended');
});

// ---------------------------------------------------------------------------
// Owners
// ---------------------------------------------------------------------------

test('managing owners needs platform.manage', async () => {
  const r = res();
  await handlePlatform(req({ url: '/platform/owners', cookie: session() }), r, deps({ permissions: ['gym.view'] }));
  assert.equal(r.statusCode, 403);
});

test('an owner account can be switched off, and it is audited', async () => {
  // The reason this exists: an owner account is compromised at 2am and there
  // must be a way to stop it that is not a SQL console.
  const d = deps({ permissions: ['platform.manage'] });
  const r = res();

  await handlePlatform(
    req({ method: 'POST', url: '/platform/owners/o1/deactivate', cookie: session(), body: `csrf=${csrf()}` }),
    r, d
  );

  assert.deepEqual(d.calls.owners[0], { id: 'o1', active: false });
  assert.ok(d.calls.audits.some((a) => a.action === 'platform.owner.deactivated'));
});

test('an owner account can be switched back on', async () => {
  const d = deps({ permissions: ['platform.manage'] });
  const r = res();

  await handlePlatform(
    req({ method: 'POST', url: '/platform/owners/o1/reactivate', cookie: session(), body: `csrf=${csrf()}` }),
    r, d
  );

  assert.deepEqual(d.calls.owners[0], { id: 'o1', active: true });
});

// ---------------------------------------------------------------------------
// Money, at a glance
// ---------------------------------------------------------------------------

test('the finance screen needs subscription.manage', async () => {
  const r = res();
  await handlePlatform(req({ url: '/platform/finance', cookie: session() }), r, deps({ permissions: ['gym.view'] }));
  assert.equal(r.statusCode, 403);
});

test('the finance screen warns that an unpriced plan is billing nobody', async () => {
  // The single most expensive thing that can quietly be true about this
  // platform: gyms using it, and no invoice ever raised.
  const r = res();
  await handlePlatform(req({ url: '/platform/finance', cookie: session() }), r, deps({ permissions: ['subscription.manage'] }));

  assert.equal(r.statusCode, 200);
  assert.match(r.body, /1998\.00/, 'paid is shown in rands');
  assert.match(r.body, /basic/, 'and the unpriced plan is named');
  assert.match(r.body, /not being billed|no price/i);
});

// ---------------------------------------------------------------------------
// Changing one gym's plan — the request every gym eventually makes
// ---------------------------------------------------------------------------

test('changing a gym plan needs subscription.manage', async () => {
  const d = { ...deps({ permissions: ['gym.view'] }), changeGymPlan: async () => {} };
  const r = res();

  await handlePlatform(
    req({ method: 'POST', url: '/platform/registry/gym-1/plan', cookie: session(),
          body: `plan_key=prime&csrf=${csrf()}` }),
    r, d
  );

  assert.equal(r.statusCode, 403);
});

test('a gym can be moved to another plan, and it is audited', async () => {
  const changes = [];
  const d = {
    ...deps({ permissions: ['subscription.manage'] }),
    changeGymPlan: async (gymId, planKey) => { changes.push({ gymId, planKey }); },
  };
  const r = res();

  await handlePlatform(
    req({ method: 'POST', url: '/platform/registry/gym-1/plan', cookie: session(),
          body: `plan_key=prime&csrf=${csrf()}` }),
    r, d
  );

  assert.deepEqual(changes[0], { gymId: 'gym-1', planKey: 'prime' });
  assert.ok(d.calls.audits.some((a) => a.action === 'platform.gym.plan_changed'));
  assert.equal(r.statusCode, 302);
});

test('a plan key that does not exist is refused, not written', async () => {
  // Writing an unknown plan_key would leave the gym with no entitlements at
  // all — gating fails closed, so every feature would switch off at once.
  const changes = [];
  const d = {
    ...deps({ permissions: ['subscription.manage'] }),
    changeGymPlan: async (gymId, planKey) => { changes.push({ gymId, planKey }); },
  };
  const r = res();

  await handlePlatform(
    req({ method: 'POST', url: '/platform/registry/gym-1/plan', cookie: session(),
          body: `plan_key=platinum-deluxe&csrf=${csrf()}` }),
    r, d
  );

  assert.equal(r.statusCode, 400);
  assert.equal(changes.length, 0);
});

test('changing a plan without a CSRF token is refused', async () => {
  const changes = [];
  const d = {
    ...deps({ permissions: ['subscription.manage'] }),
    changeGymPlan: async (...a) => { changes.push(a); },
  };
  const r = res();

  await handlePlatform(
    req({ method: 'POST', url: '/platform/registry/gym-1/plan', cookie: session(), body: 'plan_key=prime' }),
    r, d
  );

  assert.equal(r.statusCode, 403);
  assert.equal(changes.length, 0);
});
