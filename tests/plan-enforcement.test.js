// Plans are actually enforced — at the router, inside the gym's scope.
//
// Three faults stacked on top of each other meant no plan limit had ever
// applied to any request:
//
//   1. The resolved gym carried NO PLAN. resolveGym() returned the gym, its
//      connection, schema and client — and neither the plan's features nor
//      its member limit. The member limit was therefore always "none".
//   2. The admin router checked the plan BEFORE withGym(). The gym is only
//      known inside that scope, so every request looked like single-gym mode
//      and was allowed.
//   3. The member and auth routers checked nothing at all.
//
// Fixing only (2) would have been worse than leaving it: with no features on
// the resolved gym, every gated route would 402 for EVERY gym — KOM included.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { runWithGym, planFor, resolveGym } from '../server/lib/tenancy.js';
import { entitlementFor, allowsMemberRegistration, enforceEntitlement } from '../server/lib/entitlements.js';
import { ROUTE_FEATURES, MEMBER_ROUTE_FEATURES, AUTH_ROUTE_FEATURES, FEATURES } from '../shared/features.js';
import { PLANS } from '../platform/plans.js';

const planRow = (key) => {
  const p = PLANS.find((x) => x.key === key);
  return { key, features: p.features, max_active_members: p.maxActiveMembers };
};

const gymOn = (key) => ({ gym: { slug: `${key}-gym` }, ...planFor(planRow(key)) });

// ---------------------------------------------------------------------------
// 1. The plan reaches the resolved gym
// ---------------------------------------------------------------------------

test('RESOLUTION CARRIES THE GYM\'S PLAN', async () => {
  const resolved = await resolveGym('bos-gym', {
    lookupGym: async () => ({
      gym: { id: 'g1', slug: 'bos-gym', status: 'active', plan_key: 'medium' },
      connection: { schema_name: 'gym_bos_gym', status: 'healthy' },
      plan: planRow('medium'),
    }),
    shared: { url: 'https://x.supabase.co', key: 'k' },
    createClient: () => ({}),
  });

  assert.ok(resolved.features.includes(FEATURES.CLASSES));
  assert.ok(!resolved.features.includes(FEATURES.FACE));
  assert.equal(resolved.plan.maxActiveMembers, 150);
});

test('a plan with no member limit is unlimited, not zero', () => {
  // NULL in platform_plans. Number(null) is 0 — a gym that could register nobody.
  assert.equal(planFor({ key: 'x', features: [], max_active_members: null }).plan.maxActiveMembers, null);
});

test('a missing plan fails CLOSED, as it always meant to', () => {
  // "Absence of a plan is not permission" — the rule entitlements.js was
  // written with. A misconfigured gym is refused, visibly, not given everything.
  assert.equal(planFor(null).features, null);
  const check = runWithGym({ gym: {}, features: null }, () => entitlementFor('classes'));
  assert.equal(check.allowed, false);
  assert.equal(check.status, 402);
});

test('THE MEMBER LIMIT NOW HAS A NUMBER TO ENFORCE', () => {
  const at = (n) => runWithGym(gymOn('basic'), () => allowsMemberRegistration(n));
  assert.equal(at(39).allowed, true);
  assert.equal(at(40).allowed, false);
  assert.equal(at(40).status, 402);
});

// ---------------------------------------------------------------------------
// 2. The routers check inside the gym's scope
// ---------------------------------------------------------------------------

for (const router of ['api/admin/[...path].js', 'api/member/[...path].js', 'api/auth/[...path].js']) {
  test(`${router} checks the plan INSIDE withGym()`, () => {
    const source = readFileSync(router, 'utf8');
    const scope = source.indexOf('withGym(');
    const check = source.indexOf('enforceEntitlement(seg');

    assert.ok(check > -1, 'the router checks the plan');
    assert.ok(check > scope, 'after withGym has opened the gym scope — before it, no gym is known');
    assert.ok(!/\n\s*if \(!enforceEntitlement/.test(source), 'no check outside the scope');
  });
}

// ---------------------------------------------------------------------------
// 3. Every live route is mapped, or it would 404 the moment this ships
// ---------------------------------------------------------------------------

function routeKeys(file) {
  // The entries of `const routes = { ... }`, one per line or all on one.
  const source = readFileSync(file, 'utf8');
  const start = source.indexOf('const routes = {') + 'const routes = {'.length;
  const body = source.slice(start, source.indexOf('}', start));
  return body
    .replace(/\/\/.*$/gm, '')
    .split(',')
    .map((entry) => entry.split(':')[0].trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)
    .map((k) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`));
}

for (const [file, map] of [
  ['api/admin/[...path].js', ROUTE_FEATURES],
  ['api/member/[...path].js', MEMBER_ROUTE_FEATURES],
  ['api/auth/[...path].js', AUTH_ROUTE_FEATURES],
]) {
  test(`EVERY ROUTE IN ${file} HAS A PLAN MAPPING`, () => {
    // An unmapped route fails closed with 404. Until today no mapping was ever
    // exercised, so a gap here would break a live KOM screen on deploy.
    const keys = routeKeys(file);
    assert.ok(keys.length > 3, `found the routes in ${file}`);
    const unmapped = keys.filter((k) => !map[k]);
    assert.deepEqual(unmapped, [], `unmapped routes in ${file}`);
  });
}

// ---------------------------------------------------------------------------
// 4. What each plan actually gets
// ---------------------------------------------------------------------------

const allowed = (plan, route, map) =>
  runWithGym(gymOn(plan), () => entitlementFor(route, map)).allowed;

test('A BASIC GYM\'S MEMBERS CANNOT USE MEDIUM OR PRIME FEATURES', () => {
  for (const route of ['book-class', 'classes', 'messages', 'progress', 'refer', 'face-login', 'enroll-face']) {
    assert.equal(allowed('basic', route, MEMBER_ROUTE_FEATURES), false, `basic member: ${route}`);
  }
});

test('a BASIC gym\'s members keep the whole core portal', () => {
  for (const route of ['login', 'status', 'checkin', 'history', 'profile']) {
    assert.equal(allowed('basic', route, MEMBER_ROUTE_FEATURES), true, `basic member: ${route}`);
  }
});

test('ASKING FOR ONE\'S DATA TO BE ERASED IS NEVER A PAID FEATURE', () => {
  for (const plan of ['basic', 'medium', 'prime']) {
    assert.equal(allowed(plan, 'request-deletion', MEMBER_ROUTE_FEATURES), true, plan);
  }
});

test('staff sign in on every plan; staff sign in BY FACE only on PRIME', () => {
  for (const plan of ['basic', 'medium', 'prime']) {
    assert.equal(allowed(plan, 'login', AUTH_ROUTE_FEATURES), true, plan);
  }
  assert.equal(allowed('medium', 'face-login', AUTH_ROUTE_FEATURES), false);
  assert.equal(allowed('prime', 'face-login', AUTH_ROUTE_FEATURES), true);
});

test('PRIME — which KOM is on — reaches every route in every router', () => {
  // KOM is live on PRIME. If this fails, deploying would switch off part of a
  // real gym.
  for (const map of [ROUTE_FEATURES, MEMBER_ROUTE_FEATURES, AUTH_ROUTE_FEATURES]) {
    for (const route of Object.keys(map)) {
      assert.equal(allowed('prime', route, map), true, `prime: ${route}`);
    }
  }
});

test('the SQL seed gives PRIME every feature there is', () => {
  // The table, not plans.js, is what production reads.
  const sql = readFileSync('platform/RUN-THIS.sql', 'utf8');
  const prime = sql.slice(sql.indexOf("('prime'"), sql.indexOf(']', sql.indexOf("('prime'")));
  for (const feature of Object.values(FEATURES)) {
    assert.ok(prime.includes(`"${feature}"`), `prime seed lacks "${feature}"`);
  }
});

test('a refusal is 402 with the feature named, so the screen can offer the upgrade', () => {
  let status, body;
  const res = {};
  const json = (_r, s, b) => { status = s; body = b; };
  const ok = runWithGym(gymOn('basic'), () => enforceEntitlement('classes', res, json));
  assert.equal(ok, false);
  assert.equal(status, 402);
  assert.equal(body.feature, FEATURES.CLASSES);
});

// ---------------------------------------------------------------------------
// 5. CSV import respects the member limit
// ---------------------------------------------------------------------------

process.env.JWT_SECRET ||= 'test-only-gym-secret';
const { signToken } = await import('../server/lib/auth.js');
const { default: importMembers } = await import('../server/handlers/admin/members-import.js');

/** Just enough of a Supabase client for the import handler. */
function fakeGymDb(existing) {
  const members = Array.from({ length: existing }, (_, i) => ({ id: `m${i}`, status: 'active' }));
  const chain = (table) => {
    const q = {
      _head: false,
      select(_c, opts) { q._head = Boolean(opts?.head); return q; },
      neq() { return q; },
      eq() { return q; },
      maybeSingle: async () => ({ data: null, error: null }),
      insert: async (row) => { if (table === 'members') members.push(row); return { error: null }; },
      then(resolve) {
        return resolve(q._head ? { count: members.length, error: null } : { data: [], error: null });
      },
    };
    return q;
  };
  return { from: chain, members };
}

function importReq(n) {
  const token = signToken({ id: 'a1', username: 'ann', role: 'owner' }, { gym: 'medium-gym' });
  // A parsed body, as Vercel supplies it; readJsonBody() takes it as-is.
  return {
    method: 'POST',
    url: '/api/admin/members-import',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: { rows: Array.from({ length: n }, (_, i) => ({ full_name: `Person ${i}` })) },
  };
}

function captureRes() {
  // Both response styles the gym helpers use: Node's and Vercel's.
  return {
    statusCode: 200, headers: {}, body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    writeHead(code) { this.statusCode = code; return this; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = JSON.stringify(payload); return this; },
    end(b) { if (b) this.body = b; return this; },
  };
}

test('A MEDIUM GYM CANNOT IMPORT PAST 150 MEMBERS', async () => {
  const db = fakeGymDb(140);
  const res = captureRes();
  await runWithGym({ gym: { slug: 'medium-gym' }, client: db, ...planFor(planRow('medium')) }, () =>
    importMembers(importReq(25), res)
  );

  const body = JSON.parse(res.body);
  assert.equal(body.created, 10, 'only the room that was left');
  assert.equal(body.skipped, 15, 'the rest are reported, not silently dropped');
  assert.equal(body.limitReached, true);
  assert.equal(db.members.length, 150);
});

test('a gym already at its limit is refused with 402', async () => {
  const res = captureRes();
  await runWithGym({ gym: { slug: 'medium-gym' }, client: fakeGymDb(150), ...planFor(planRow('medium')) }, () =>
    importMembers(importReq(3), res)
  );
  assert.equal(res.statusCode, 402);
});

// ---------------------------------------------------------------------------
// 6. Block, and offer the upgrade (CLAUDE.md §18.4)
// ---------------------------------------------------------------------------

test('A MEMBER IS NOT TOLD TO "UPGRADE" — THEY CANNOT', () => {
  let body;
  runWithGym(gymOn('basic'), () =>
    enforceEntitlement('book-class', {}, (_r, _s, b) => { body = b; }, MEMBER_ROUTE_FEATURES, { forMembers: true })
  );
  assert.ok(!/upgrade/i.test(body.error), body.error);
  assert.equal(body.feature, FEATURES.CLASSES);
});

test('the staff session reports the gym\'s plan, and null in single-gym mode', () => {
  const me = readFileSync('server/handlers/auth/me.js', 'utf8');
  assert.match(me, /ok\(res, \{ user, plan \}\)/);
  assert.match(me, /Array\.isArray\(gym\.features\)/, 'null when there is no gym, so nothing is hidden');
});

test('a 402 anywhere raises ONE upgrade notice rather than a red box per screen', async () => {
  const events = [];
  const saved = { window: globalThis.window, fetch: globalThis.fetch, CustomEvent: globalThis.CustomEvent };
  globalThis.window = { location: { pathname: '/admin' }, sessionStorage: { getItem: () => null, setItem() {} }, dispatchEvent: (e) => events.push(e) };
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
  globalThis.fetch = async () => ({ ok: false, status: 402, json: async () => ({ error: 'no', feature: 'classes' }) });
  // Node 25 has a built-in localStorage whose methods are absent without a
  // storage file, so it is replaced outright rather than defaulted.
  const savedStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    value: { getItem: () => null, setItem() {}, removeItem() {} },
    configurable: true,
    writable: true,
  });
  try {
    const { apiFetch } = await import('../src/lib/api.js');
    await assert.rejects(apiFetch('/admin/classes'), (e) => e.status === 402, 'still thrown, so a screen\'s own handling is unchanged');
    assert.equal(events[0]?.type, 'yoyo:upgrade');
    assert.equal(events[0]?.detail.feature, 'classes');
  } finally {
    Object.assign(globalThis, saved);
    if (savedStorage) Object.defineProperty(globalThis, 'localStorage', savedStorage);
  }
});

test('LOCKED SCREENS ARE SHOWN WITH A LOCK, NOT HIDDEN', () => {
  // An owner who never sees a feature never learns it exists.
  const shell = readFileSync('src/components/AdminShell.jsx', 'utf8');
  assert.match(shell, /hasFeature\(n\.feature\) \?/);
  assert.match(shell, /🔒/);
  assert.match(shell, /<UpgradeNotice \/>/);
  // Every gated screen in the menu carries its feature.
  for (const to of ['/admin/classes', '/admin/scan', '/admin/analytics', '/admin/audit', '/admin/inbox']) {
    assert.match(shell, new RegExp(`to: '${to}'[^\n]*feature: '`), `${to} is tagged`);
  }
});

test('BACKGROUND REQUESTS ON EVERY-PLAN SCREENS DO NOT RAISE THE NOTICE', () => {
  // The inbox poll ran every minute; the Staff page asked for trainers on
  // load. On BASIC each would have opened the upgrade notice unprompted.
  const shell = readFileSync('src/components/AdminShell.jsx', 'utf8');
  assert.match(shell, /if \(!hasFeature\('messaging'\)\) return;/);
  const staff = readFileSync('src/pages/admin/Staff.jsx', 'utf8');
  assert.match(staff, /if \(hasFeature\('trainers'\)\)/);
});

test('only an OWNER is offered the upgrade button; staff are told who can', () => {
  const notice = readFileSync('src/components/UpgradeNotice.jsx', 'utf8');
  assert.match(notice, /isOwner = user\?\.role === 'owner'/);
  assert.match(notice, /\{isOwner && \(/);
});

test('the member portal shows only the tabs the gym\'s plan includes', () => {
  const portal = readFileSync('src/pages/MemberPortal.jsx', 'utf8');
  assert.match(portal, /\['classes', 'Classes', 'classes'\]/);
  assert.match(portal, /\['progress', 'Progress', 'progress'\]/);
  assert.match(portal, /\['contact', 'Contact', 'messaging'\]/);
  assert.match(portal, /visibleTabs\(features\)\.map/);
  const status = readFileSync('server/handlers/member/status.js', 'utf8');
  assert.match(status, /features: Array\.isArray\(currentGym\(\)\?\.features\)/);
});
