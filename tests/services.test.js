// Services by plan, per gym and by the owner — and the registration page that
// presents them (CLAUDE.md §41, §41.1). One test per promise.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.PLATFORM_JWT_SECRET ||= 'test-only-platform-secret-distinct';
process.env.JWT_SECRET ||= 'test-only-gym-secret';

import { effectiveFeatures, CORE_FEATURES, OWNER_SWITCHABLE, SERVICE_INFO, ALL_SERVICES, FEATURES } from '../shared/features.js';
import { cleanFacilities, facilityLabels, FACILITIES, MAX_CUSTOM_FACILITIES } from '../shared/facilities.js';
import { readOff, enforceMemberService, forgetServicesOff } from '../server/lib/member-services.js';
import { offeredServices } from '../server/handlers/public/content.js';
import { ownerFacingPlan, livePlansForOwners, EVERY_PLAN_INCLUDES, SUPPORT_BY_PLAN, planByKey } from '../platform/plans.js';
import { readApplication } from '../platform/application-form.js';
import { handlePlatform } from '../platform/router.js';
import { sessionCookie, issueCsrfToken } from '../platform/http.js';
import { signupPage, gymDetailPage, ownerDashboardPage, settingsPage, plansPage } from '../platform/views.js';
import { cleanSupport, audit } from '../platform/deps.js';

const STAFF = { id: 'staff-1', email: 'me@yoyogyms.com', kind: 'platform_staff' };
const OWNER = { id: 'owner-1', email: 'ann@bos.co', kind: 'gym_owner' };
const EVERYTHING = ['application.view', 'application.approve', 'application.reject', 'gym.view', 'gym.suspend', 'subscription.manage', 'audit.view', 'platform.manage'];

function req({ method = 'GET', url = '', who = STAFF, body = '' } = {}) {
  const r = {
    method, url,
    headers: { ...(who ? { cookie: sessionCookie(who).split(';')[0] } : {}), 'content-type': 'application/x-www-form-urlencoded' },
    _body: body,
  };
  r[Symbol.asyncIterator] = async function* () { if (r._body) yield Buffer.from(r._body); };
  return r;
}
function res() {
  return {
    statusCode: 200, headers: {}, body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    writeHead(code, h) { this.statusCode = code; for (const [k, v] of Object.entries(h || {})) this.headers[k.toLowerCase()] = v; return this; },
    end(b) { this.body = b || ''; return this; },
  };
}
async function call(opts, deps) {
  const r = res();
  await handlePlatform(req(opts), r, { audit: async () => {}, permissionsFor: async () => EVERYTHING, ...deps });
  return r;
}
const csrf = (id = 'staff-1') => encodeURIComponent(issueCsrfToken(id));

// ---------------------------------------------------------------------------
// The rule: plan + added − removed, core always on
// ---------------------------------------------------------------------------

test("Q2 A GYM GETS ITS PLAN, PLUS WHAT WAS ADDED FOR IT, MINUS WHAT WAS TAKEN AWAY", () => {
  const plan = [...CORE_FEATURES, FEATURES.CLASSES];
  const result = effectiveFeatures(plan, [FEATURES.FACE], [FEATURES.CLASSES]);
  assert.ok(result.includes(FEATURES.FACE), 'added for this gym');
  assert.ok(!result.includes(FEATURES.CLASSES), 'removed for this gym');
  for (const f of CORE_FEATURES) assert.ok(result.includes(f));
});

test('Q2 core services survive any removal — a gym without them is not running', () => {
  const result = effectiveFeatures([...CORE_FEATURES], [], [FEATURES.MEMBERS, FEATURES.CHECKIN]);
  assert.ok(result.includes(FEATURES.MEMBERS));
  assert.ok(result.includes(FEATURES.CHECKIN));
});

test('a typo in the registry grants nothing', () => {
  const result = effectiveFeatures([...CORE_FEATURES], ['everything', 'admin'], []);
  assert.deepEqual(result.filter((f) => !CORE_FEATURES.includes(f)), []);
});

test('every service is named once, for owners and (where it applies) for members', () => {
  for (const f of Object.values(FEATURES)) {
    assert.ok(SERVICE_INFO[f]?.label, `${f} has a name`);
    assert.ok(['core', 'members', 'running'].includes(SERVICE_INFO[f].group));
  }
  for (const f of OWNER_SWITCHABLE) assert.ok(SERVICE_INFO[f].forMembers, `${f} says what members get`);
});

// ---------------------------------------------------------------------------
// The owner's own switch
// ---------------------------------------------------------------------------

test('Q2 only member services can be switched off by an owner, whatever is stored', () => {
  assert.deepEqual(readOff({ off: ['classes', 'members', 'payments', 'nonsense'] }), ['classes']);
  assert.deepEqual(readOff(null), []);
});

test("Q2 A MEMBER CANNOT USE WHAT THE OWNER SWITCHED OFF — and is told plainly", async () => {
  forgetServicesOff();
  const db = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { value: { off: ['classes'] } } }) }) }) }) };
  let answer = null;
  const json = (_res, status, body) => { answer = { status, body }; };
  assert.equal(await enforceMemberService('book-class', {}, json, undefined, db), false);
  assert.equal(answer.status, 403);
  assert.match(answer.body.error, /does not offer/);
  assert.equal(await enforceMemberService('status', {}, json, undefined, db), true, 'core routes are never switched off');
  forgetServicesOff();
});

test('a settings read that fails never takes a service away from members', async () => {
  forgetServicesOff();
  const broken = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ error: { message: 'down' } }) }) }) }) };
  assert.equal(await enforceMemberService('book-class', {}, () => {}, undefined, broken), true);
  forgetServicesOff();
});

test('the member router checks the owner, after the plan', () => {
  const router = readFileSync('api/member/[...path].js', 'utf8');
  assert.match(router, /enforceEntitlement\(seg[^)]*\) &&\s*\(await enforceMemberService\(seg, res, json\)\)/);
});

test('the gym settings handler stores the owner switch and facilities CLEANED, never as sent', () => {
  const handler = readFileSync('server/handlers/admin/settings.js', 'utf8');
  assert.match(handler, /if \(key === MEMBER_SERVICES_KEY\) stored = \{ off: readOff\(value\) \}/);
  assert.match(handler, /if \(key === FACILITIES_KEY\) stored = cleanFacilities\(value\)/);
});

// ---------------------------------------------------------------------------
// Q8 — facilities
// ---------------------------------------------------------------------------

test('Q8 facilities: known keys kept, the owner\'s own words trimmed, de-duplicated and capped', () => {
  const clean = cleanFacilities({
    items: ['showers', 'sauna', 'rocket_launcher'],
    custom: ['  Boxing   ring ', 'boxing ring', '', ...Array.from({ length: 30 }, (_, i) => `Thing ${i}`)],
  });
  assert.deepEqual(clean.items, ['showers', 'sauna']);
  assert.equal(clean.custom[0], 'Boxing ring');
  assert.equal(clean.custom.length, MAX_CUSTOM_FACILITIES);
  assert.deepEqual(facilityLabels({ items: ['wifi'], custom: ['Boxing ring'] }), ['Free Wi-Fi', 'Boxing ring']);
  assert.ok(FACILITIES.length >= 12);
});

// ---------------------------------------------------------------------------
// Q1 — what members see
// ---------------------------------------------------------------------------

test('Q1 members are shown only services their gym offers: in the plan, not switched off, and meant for members', () => {
  const plan = [...CORE_FEATURES, FEATURES.CLASSES, FEATURES.REPORTING];
  const shown = offeredServices(plan, ['classes']).map((s) => s.key);
  assert.ok(!shown.includes('classes'), 'switched off by the owner');
  assert.ok(!shown.includes('reporting'), 'a tool for the owner, not a member service');
  assert.ok(!shown.includes('face'), 'not in the plan');
  assert.ok(shown.includes('checkin'));
});

test('Q1 the gym front page, the portal and the app all show the offer', () => {
  assert.match(readFileSync('src/pages/Splash.jsx', 'utf8'), /<GymOffer /);
  assert.match(readFileSync('src/pages/MemberPortal.jsx', 'utf8'), /<GymOffer /);
  const app = readFileSync('apps/mobile/www/member.js', 'utf8');
  // In the app, one tap from the home (design critique 2026-09-29) — still shown.
  assert.match(app, /homeLink\('data-m="offer"'/);
  assert.match(app, /function renderOffer\(main\)[\s\S]{0,200}gymOffer\(\)/);
  assert.match(app, /state\.off = Array\.isArray\(d\.services_off\)/, 'and the app hides what the owner switched off');
});

// ---------------------------------------------------------------------------
// The registration page — live plans, true promises, the agreement (Q5, Q6)
// ---------------------------------------------------------------------------

const LIVE = [
  { key: 'basic', label: 'Basic', price_cents: 29900, currency: 'ZAR', max_active_members: 40, is_enabled: true, features: [...CORE_FEATURES] },
  { key: 'medium', label: 'Medium', price_cents: 59900, currency: 'ZAR', max_active_members: 150, is_enabled: true, features: [...CORE_FEATURES, 'classes', 'trainers'] },
  { key: 'prime', label: 'Prime', price_cents: 99900, currency: 'ZAR', max_active_members: 500, is_enabled: true, features: ALL_SERVICES },
];

test('THE REGISTRATION PAGE SHOWS THE PRICES THE MAIN ADMIN SET — it said "Contact us" while prices existed', async () => {
  const r = await call({ url: '/platform/apply', who: null }, { listPlans: async () => LIVE });
  assert.equal(r.statusCode, 200);
  assert.match(r.body, /R299/);
  assert.match(r.body, /R999/);
  assert.ok(!/Contact us|Price on request/.test(r.body));
});

test('a plan switched off for new gyms is not offered at registration', async () => {
  const plans = await livePlansForOwners({ listPlans: async () => LIVE.map((p) => (p.key === 'medium' ? { ...p, is_enabled: false } : p)) });
  assert.deepEqual(plans.map((p) => p.key), ['basic', 'prime']);
});

test('a plan shows the services the main admin switched on, not a list written in the code', () => {
  const shown = ownerFacingPlan({ ...LIVE[1], features: [...CORE_FEATURES, 'face'] });
  assert.ok(shown.included.includes(SERVICE_INFO.face.label));
  assert.ok(!shown.included.includes(SERVICE_INFO.classes.label));
});

test('Q6 every plan states what Yoyo Gyms commits to, and Prime the most', () => {
  assert.ok(SUPPORT_BY_PLAN.prime.some((s) => /account manager/i.test(s)));
  assert.ok(SUPPORT_BY_PLAN.prime.some((s) => /WhatsApp/.test(s)));
  assert.ok(SUPPORT_BY_PLAN.medium.some((s) => /same-business-day/.test(s)));
  for (const k of ['basic', 'medium', 'prime']) assert.ok(SUPPORT_BY_PLAN[k].some((s) => /Setup help/.test(s)));
});

test('Q6 NO PROMISE THE PRODUCT DOES NOT KEEP: no store apps claimed, no Prime-only screen promised to every plan', () => {
  const text = EVERY_PLAN_INCLUDES.map(([t, d]) => `${t} ${d}`).join(' ');
  assert.ok(!/Android|iPhone|App Store|Google Play/.test(text), 'the app is not in the stores yet');
  assert.ok(!/audit (log|trail)/i.test(text), 'reading the audit log is Prime');
  assert.ok(!/import/i.test(text) || /help you move/.test(text), 'self-service import is Medium and up');
});

test('Q5 the registration page shows the key terms, marks the draft, and requires "I agree"', () => {
  const html = signupPage({
    plans: LIVE.map((p) => ownerFacingPlan(p, LIVE)),
    terms: [{ title: '1. The parties', body: 'This agreement is between you and us. More words.' }],
    termsApproved: false,
    includes: EVERY_PLAN_INCLUDES,
  });
  assert.match(html, /1\. The parties/);
  assert.match(html, /This agreement is between you and us\./);
  assert.ok(!html.includes('More words'), 'the opening sentence, not the whole section');
  assert.match(html, /DRAFT/);
  assert.match(html, /<input type="checkbox" name="accept_terms" value="yes" required/);
  assert.match(html, /href="\/platform\/terms"/);
  for (const [title] of EVERY_PLAN_INCLUDES) assert.ok(html.includes(title.replace(/'/g, '&#39;')), title);
});

test('Q5 an application without "I agree" is refused, with a reason', () => {
  const base = { owner_name: 'Ann', email: 'a@b.co', password: 'longenough1', phone: '+27821234567', gym_name: 'Bos', address: '1 A St', plan: 'basic' };
  assert.match(readApplication(base).error, /Gym Owner Agreement/);
  assert.equal(readApplication({ ...base, accept_terms: 'yes' }).error, null);
  assert.equal(readApplication({ ...base, accept_terms: true }).error, null, 'the app sends true');
});

// ---------------------------------------------------------------------------
// The main admin's switches
// ---------------------------------------------------------------------------

test("Q2 A PLAN'S SERVICES ARE SAVED FROM ITS SWITCHES — and core services stay on whatever is sent", async () => {
  const saved = [];
  const r = await call(
    { method: 'POST', url: '/platform/plans/basic', body: `csrf=${csrf()}&price=299&max_active_members=40&is_enabled=1&svc_classes=1&svc_face=1` },
    { updatePlan: async (key, patch) => saved.push({ key, ...patch }), listPlans: async () => LIVE }
  );
  assert.equal(r.statusCode, 302);
  assert.ok(saved[0].features.includes('classes'));
  assert.ok(saved[0].features.includes('face'));
  assert.ok(!saved[0].features.includes('marketing'), 'not switched on');
  for (const f of CORE_FEATURES) assert.ok(saved[0].features.includes(f), `${f} kept on`);
});

test('the Plans page shows each plan\'s services as switches, core as always included', () => {
  const html = plansPage({ plans: LIVE, user: { email: 'a', kind: 'platform_staff' } });
  assert.match(html, /name="svc_classes" value="1" checked/, 'Medium includes classes');
  assert.match(html, /Always included/);
  assert.ok(!/name="svc_members"/.test(html), 'core services are not switches');
});

test('Q2 ONE GYM CAN HAVE A SERVICE ADDED OR REMOVED — for that gym alone', async () => {
  const saved = [];
  const r = await call(
    { method: 'POST', url: '/platform/registry/g1/services', body: `csrf=${csrf()}&svc_face=add&svc_classes=remove&svc_trainers=plan` },
    { setGymServices: async (id, v) => saved.push({ id, ...v }) }
  );
  assert.equal(r.headers.location, '/platform/registry/g1?sent=services');
  assert.deepEqual(saved, [{ id: 'g1', added: ['face'], removed: ['classes'] }]);
});

test("changing one gym's services needs the billing permission", async () => {
  const r = await call(
    { method: 'POST', url: '/platform/registry/g1/services', body: `csrf=${csrf()}&svc_face=add` },
    { permissionsFor: async () => ['gym.view'], setGymServices: async () => assert.fail('must not save') }
  );
  assert.equal(r.statusCode, 403);
});

test("the gym page shows the plan, this gym's choice and the RESULT for every service", () => {
  const html = gymDetailPage({
    gym: { id: 'g1', slug: 'bos', status: 'active', plan_key: 'medium', features_added: ['face'], features_removed: ['classes'] },
    plan: { features: [...CORE_FEATURES, 'classes', 'trainers'] },
    canBill: true,
  });
  assert.match(html, /name="svc_face"[\s\S]*?value="add" selected/);
  assert.match(html, /name="svc_classes"[\s\S]*?value="remove" selected/);
  assert.match(html, /action="\/platform\/registry\/g1\/services"/);
});

// ---------------------------------------------------------------------------
// Q6, Q7 — account manager, setup help, support contacts
// ---------------------------------------------------------------------------

test('Q6 an account manager is set by the platform owner only', async () => {
  const set = [];
  const ok = await call(
    { method: 'POST', url: '/platform/registry/g1/account-manager', body: `csrf=${csrf()}&staff_id=s2` },
    { setAccountManager: async (g, s) => set.push([g, s]) }
  );
  assert.equal(ok.headers.location, '/platform/registry/g1?sent=manager');
  assert.deepEqual(set, [['g1', 's2']]);
  const refused = await call(
    { method: 'POST', url: '/platform/registry/g1/account-manager', body: `csrf=${csrf()}&staff_id=s2` },
    { permissionsFor: async () => ['gym.view'], setAccountManager: async () => assert.fail('must not save') }
  );
  assert.equal(refused.statusCode, 403);
});

test('Q6 SETUP HELP IS TRACKED: the owner asks, Today counts it, staff record it as given', async () => {
  const asked = [];
  const r = await call(
    { method: 'POST', url: '/platform/my-gym/setup-help', who: OWNER, body: `csrf=${csrf('owner-1')}` },
    { requestSetupHelp: async (u) => asked.push(u) }
  );
  assert.equal(r.headers.location, '/platform/my-gym');
  assert.deepEqual(asked, ['owner-1'], 'their own gym, found by the session');

  const done = [];
  const d = await call({ method: 'POST', url: '/platform/registry/g1/setup-done', body: `csrf=${csrf()}` }, { markSetupDone: async (g) => done.push(g) });
  assert.equal(d.headers.location, '/platform/registry/g1?sent=setup');
  assert.deepEqual(done, ['g1']);

  const today = await call({ url: '/platform/home' }, { countSetupRequests: async () => 2, listApplications: async () => [], listGyms: async () => [], financeSummary: async () => ({}), listAuditLog: async () => [] });
  assert.match(today.body, /2 gyms asked for setup help/);
  assert.match(today.body, /href="\/platform\/registry\?setup=1"/);
});

test('Q7 support contacts: a real email or the default, a WhatsApp number in +digits or none', () => {
  assert.deepEqual(cleanSupport({ email: 'Help@Yoyo.co', whatsapp: '0027 82 123 4567' }), { email: 'help@yoyo.co', whatsapp: '+27821234567' });
  assert.deepEqual(cleanSupport({ email: 'nope', whatsapp: '082' }), { email: 'hello@mulesoo.com', whatsapp: '' });
});

test('Q7 the platform owner saves the support contacts on the Settings page', async () => {
  const saved = [];
  const r = await call(
    { method: 'POST', url: '/platform/settings/support', body: `csrf=${csrf()}&email=help%40yoyo.co&whatsapp=%2B27821234567` },
    { saveSupportContacts: async (v) => { saved.push(v); return cleanSupport(v); } }
  );
  assert.equal(r.headers.location, '/platform/settings?saved=support');
  assert.deepEqual(saved, [{ email: 'help@yoyo.co', whatsapp: '+27821234567' }]);
  assert.match(settingsPage({ support: { email: 'help@yoyo.co', whatsapp: '' }, csrfToken: 't' }), /action="\/platform\/settings\/support"/);
});

test("Q6/Q7 THE OWNER SEES THEIR PLAN'S SUPPORT — WhatsApp and account manager on Prime only", () => {
  const support = { email: 'help@yoyo.co', whatsapp: '+27821234567', manager: { full_name: 'Zola', email: 'zola@yoyo.co' } };
  const prime = ownerDashboardPage({ user: { email: 'a' }, gym: { id: 'g1', slug: 'x', status: 'active', plan_key: 'prime' }, support, planSupport: SUPPORT_BY_PLAN.prime });
  assert.match(prime, /wa\.me\/27821234567/);
  assert.match(prime, /Zola/);
  const basic = ownerDashboardPage({ user: { email: 'a' }, gym: { id: 'g1', slug: 'x', status: 'active', plan_key: 'basic' }, support: { ...support, manager: null }, planSupport: SUPPORT_BY_PLAN.basic });
  assert.ok(!/wa\.me/.test(basic), 'the WhatsApp line is a Prime promise');
  assert.match(basic, /Ask for setup help/);
});

test('every control in the main admin panel is at least 44 px tall', () => {
  const html = plansPage({ plans: LIVE, user: { email: 'a', kind: 'platform_staff' } });
  assert.match(html, /button \{[^}]*min-height:44px/);
  assert.match(html, /\.btn \{[^}]*min-height:44px/);
});

test('ownerFacingPlan still describes the defaults without a price', () => {
  assert.equal(ownerFacingPlan(planByKey('prime')).price, null);
});

// The audit log's entity_id is a uuid column. A plan key ('basic') or
// 'support' made Postgres refuse the whole row, silently: no price change and
// no support-contact change was ever recorded (found live, 2026-09-29).
test('an audit entry named by a key, not an id, is still recorded', async () => {
  const rows = [];
  const db = { from: () => ({ insert: async (row) => {
    if (row.entity_id !== null && !/^[0-9a-f-]{36}$/i.test(row.entity_id)) return { error: { message: 'invalid input syntax for type uuid' } };
    rows.push(row);
    return { error: null };
  } }) };

  await audit(db, { action: 'platform.plan.updated', entity: 'plan', entity_id: 'basic', detail: { price_cents: 49900 } });
  await audit(db, { action: 'platform.settings.support_changed', entity: 'settings', entity_id: 'support' });
  await audit(db, { action: 'gym.suspended', entity: 'gym', entity_id: '0b6a9a52-2a8e-4f7c-9d7e-1c2b3a4d5e6f' });

  assert.equal(rows.length, 3, 'all three recorded');
  assert.equal(rows[0].entity_id, null);
  assert.deepEqual(rows[0].detail, { price_cents: 49900, entity_key: 'basic' });
  assert.deepEqual(rows[1].detail, { entity_key: 'support' });
  assert.equal(rows[2].entity_id, '0b6a9a52-2a8e-4f7c-9d7e-1c2b3a4d5e6f', 'a real id is kept as it is');
  assert.equal(rows[2].detail, null);
});

test('a refused audit entry is reported, not swallowed', async () => {
  const db = { from: () => ({ insert: async () => ({ error: { message: 'permission denied' } }) }) };
  const said = [];
  const original = console.error;
  console.error = (...args) => said.push(args.join(' '));
  try {
    await audit(db, { action: 'gym.suspended', entity: 'gym', entity_id: null });
  } finally {
    console.error = original;
  }
  assert.ok(said.some((s) => s.includes('gym.suspended') && s.includes('permission denied')));
});
