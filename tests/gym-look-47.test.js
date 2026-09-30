// CLAUDE.md §47: signing out returns to Yoyo Gyms; a gym's poster is shown
// whole and its logo in one tile; its colour is a colour; and what a person at
// Yoyo delivers — and the free trial — are switches on each plan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import { TextEncoder, TextDecoder } from 'node:util';

process.env.JWT_SECRET ||= 'test-only-gym-secret';
process.env.PLATFORM_JWT_SECRET ||= 'test-only-signing-key-not-used-anywhere';

const { fakeDb } = await import('./fake-db.js');
const { runWithGym } = await import('../server/lib/tenancy.js');
const { signToken } = await import('../server/lib/auth.js');
const { ALL_SERVICES } = await import('../shared/features.js');
const { default: settings } = await import('../server/handlers/admin/settings.js');
const { promisesOf, trialDaysOf, supportFor, ownerFacingPlan, DEFAULT_TRIAL_DAYS, EVERY_PLAN_INCLUDES } = await import('../platform/plans.js');
const { startTrial } = await import('../platform/billing.js');
const { handlePlatform } = await import('../platform/router.js');
const { sessionCookie, issueCsrfToken } = await import('../platform/http.js');
const { plansPage, signupPage } = await import('../platform/views.js');

const read = (f) => readFileSync(f, 'utf8');

// ---------------------------------------------------------------------------
// Signing out
// ---------------------------------------------------------------------------

test('signing out of the app returns to the Yoyo Gyms front page, not the gym\'s sign-in', async () => {
  const www = (f) => read('apps/mobile/www/' + f);
  const dom = new JSDOM(www('index.html').replace(/<script src="[^"]+"><\/script>/g, ''), {
    url: 'https://localhost/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole(),
  });
  const { window } = dom;
  window.TextEncoder = TextEncoder;
  window.TextDecoder = TextDecoder;
  window.localStorage.setItem('yoyo.member.token:kom', JSON.stringify('tok'));
  window.fetch = async (url) => {
    const path = String(url).replace('https://yoyogym.vercel.app', '').split('?')[0];
    const body = path === '/api/member/status'
      ? { member: { full_name: 'Thandi Mokoena', status: 'active', membership_number: 'GYM-1' }, membership: {}, features: ['members'] }
      : path === '/api/content' ? { branding: { name: 'KOM', accent_color: '#E63946' } } : {};
    return { ok: true, status: 200, json: async () => body };
  };
  for (const f of ['config.js', 'qr-payload.js', 'vendor-qrcode.js', 'member.js', 'app.js']) window.eval(www(f));
  window.YOYO_MEMBER.open('kom', { name: 'KOM' });
  await new Promise((r) => setTimeout(r, 40));
  const doc = window.document;
  doc.querySelector('[data-tab="profile"]').dispatchEvent(new window.Event('click', { bubbles: true }));
  doc.querySelector('[data-m="signout"]').dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.ok(doc.getElementById('member').classList.contains('hidden'), 'the gym\'s area is closed');
  assert.ok(!doc.getElementById('home').classList.contains('hidden'), 'the Yoyo front page is shown');
  assert.match(doc.querySelector('#home [data-note]').textContent, /signed out/);
  assert.equal(window.localStorage.getItem('yoyo.member.token:kom'), null);
});

// ---------------------------------------------------------------------------
// Pictures
// ---------------------------------------------------------------------------

test('a gym\'s poster is shown WHOLE — fitted, never cropped — with its own colours around it', () => {
  const app = read('apps/mobile/www/index.html');
  assert.match(app, /#member\.has-poster::after \{[^}]*var\(--m-poster\) center top \/ contain no-repeat/);
  assert.match(app, /\.g-screen\.has-poster::after \{[^}]*var\(--g-poster\) center top \/ contain no-repeat/);
  const web = read('src/components/GymBackdrop.jsx');
  assert.match(web, /object-contain object-top/);
  assert.match(web, /max-w-\[520px\]/, 'phone-width on a computer');
  assert.match(read('src/index.css'), /\.admin-brand__poster-whole \{[^}]*object-fit: contain/);
});

test('a gym\'s logo always sits in the same light tile, fitted with a margin', () => {
  const member = read('apps/mobile/www/member.js');
  assert.match(member, /m-gymicon m-gymicon--logo" style="width:' \+ size \+ 'px;height:' \+ size/);
  assert.match(read('apps/mobile/www/index.html'), /\.m-gymicon--logo img \{ display: block; width: 100%; height: 100%; object-fit: contain; \}/);
  assert.match(read('apps/mobile/www/index.html'), /\.g-mark\.has-logo \{ display: flex; align-items: center; justify-content: center; background: #ffffff; \}/);
  assert.match(read('apps/mobile/www/index.html'), /\.g-mark img \{ display: block; width: 76%; height: 76%; object-fit: contain; \}/);
  assert.match(read('src/components/GymIcon.jsx'), /style=\{\{ width: size, height: size[^}]*\}\}\s*className=\{`inline-flex flex-none items-center justify-center bg-white/);
});

// ---------------------------------------------------------------------------
// The gym's colour
// ---------------------------------------------------------------------------

async function saveProfile(value) {
  const db = fakeDb({ settings: [], audit_log: [] });
  // The save checks picture addresses against the gym's storage folder.
  db.storage = { from: () => ({ getPublicUrl: (p) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/gym-branding/${p}` } }) }) };
  const res = {
    statusCode: 200, body: '',
    status(c) { this.statusCode = c; return this; },
    setHeader() { return this; },
    end(b) { this.body = b || ''; return this; },
  };
  const token = signToken({ id: 'a1', username: 'owner', role: 'owner', full_name: 'Owner' });
  const req = { method: 'PUT', url: '/api/admin/settings', headers: { authorization: `Bearer ${token}` }, body: { key: 'gym_profile', value } };
  await runWithGym({ client: db, features: ALL_SERVICES, gym: { slug: 'kom' } }, () => settings(req, res));
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null, stored: db.tables.settings.find((r) => r.key === 'gym_profile')?.value };
}

test('a colour that is not a colour is refused, not quietly dropped', async () => {
  for (const bad of ['red', 'E63946', '#E6394', '#GGGGGG']) {
    const r = await saveProfile({ name: 'KOM', accent_color: bad });
    assert.equal(r.status, 400, bad);
    assert.match(r.body.error, /# and six digits or letters A–F/);
  }
});

test('a real colour is kept (in capitals); an empty one means the Yoyo default', async () => {
  const ok = await saveProfile({ name: 'KOM', accent_color: '#e63946' });
  assert.equal(ok.status, 200);
  assert.equal(ok.stored.accent_color, '#E63946');
  const none = await saveProfile({ name: 'KOM', accent_color: '' });
  assert.equal(none.stored.accent_color, null);
});

test('the Settings colour is a picker with a preview, and Save waits for a real colour', () => {
  const page = read('src/pages/admin/Settings.jsx');
  assert.match(page, /\['accent_color', '[^']+', 'color'\]/);
  assert.match(page, /type="color"/);
  assert.match(page, /disabled=\{badColour\}/);
});

// ---------------------------------------------------------------------------
// The plan's promises and free trial
// ---------------------------------------------------------------------------

test('what a person delivers is read from the plan\'s switches — the defaults until they are set', () => {
  assert.deepEqual(promisesOf({ key: 'prime' }), ['setup_help', 'member_import_help', 'email_support', 'same_day_replies', 'whatsapp_line', 'account_manager']);
  assert.deepEqual(promisesOf({ key: 'prime', promises: ['setup_help'] }), ['setup_help']);
  assert.deepEqual(supportFor({ key: 'basic', promises: [] }), []);
  // Same-day replies ARE email support: one line, not two.
  assert.deepEqual(supportFor({ key: 'x', promises: ['email_support', 'same_day_replies'] }), ['Email support with same-business-day replies']);
  assert.equal(trialDaysOf({ key: 'basic' }), DEFAULT_TRIAL_DAYS);
  assert.equal(trialDaysOf({ key: 'basic', trial_days: 14 }), 14);
  assert.equal(trialDaysOf({ key: 'basic', trial_days: 0 }), 0);
});

test('a new gym\'s trial is its plan\'s own length', () => {
  const now = new Date('2026-10-01T00:00:00Z');
  assert.equal(startTrial({ gymId: 'g', plan: { id: 'p', trial_days: 14 }, now }).trial_ends_at, '2026-10-15T00:00:00.000Z');
  assert.equal(startTrial({ gymId: 'g', plan: { id: 'p' }, now }).trial_ends_at, '2026-10-31T00:00:00.000Z');
});

test('the Plans page switches them, and saving stores them', async () => {
  const page = plansPage({ plans: [{ key: 'medium', label: 'Medium', price_cents: 99900, features: [], promises: ['setup_help'], trial_days: 21 }], csrfToken: 't' });
  assert.match(page, /name="promise_setup_help" value="1" checked/);
  assert.doesNotMatch(page, /name="promise_whatsapp_line" value="1" checked/);
  assert.match(page, /name="trial_days" inputmode="numeric" value="21"/);

  const saved = [];
  const staff = { id: 'staff-1', email: 's@yoyo.co', kind: 'platform_staff' };
  const body = `csrf=${encodeURIComponent(issueCsrfToken('staff-1'))}&price=999&max_active_members=150&is_enabled=1&promise_setup_help=1&promise_whatsapp_line=1&trial_days=14`;
  const req = { method: 'POST', url: '/platform/plans/medium', headers: { cookie: sessionCookie(staff).split(';')[0], 'content-type': 'application/x-www-form-urlencoded' }, _body: body };
  req[Symbol.asyncIterator] = async function* () { yield Buffer.from(req._body); };
  const res = { statusCode: 200, headers: {}, setHeader() {}, getHeader() {}, writeHead(c, h) { this.statusCode = c; this.headers = h || {}; return this; }, end() { return this; } };
  await handlePlatform(req, res, {
    permissionsFor: async () => ['subscription.manage'],
    audit: async () => {},
    updatePlan: async (key, patch) => { saved.push([key, patch]); },
  });
  assert.equal(res.statusCode, 302);
  assert.deepEqual(saved[0][1].promises, ['setup_help', 'whatsapp_line']);
  assert.equal(saved[0][1].trial_days, 14);
});

test('the plan cards say each plan\'s own free trial; the fixed promises are facts only', () => {
  const plan = ownerFacingPlan({ key: 'basic', label: 'Basic', price_cents: 49900, features: [], trial_days: 14 });
  assert.equal(plan.trialDays, 14);
  assert.match(signupPage({ plans: [plan] }), /14 days free/);
  const facts = EVERY_PLAN_INCLUDES.map(([t]) => t).join(' | ');
  assert.doesNotMatch(facts, /30 days|Bring your members/, 'those are per plan now');
  assert.doesNotMatch(read('apps/mobile/www/index.html'), /30-day free trial/);
});
