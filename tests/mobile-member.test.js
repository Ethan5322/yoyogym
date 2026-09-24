// The app's own member screens (Stage 8) — driven the way a member uses them.
//
// The real index.html and scripts, in a simulated browser at the app's own
// origin (https://localhost), against a fake server. What is asserted is what
// a person would see and what the server would receive.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import { TextEncoder, TextDecoder } from 'node:util';

const WWW = 'apps/mobile/www/';
const read = (f) => readFileSync(WWW + f, 'utf8');

const STATUS = {
  member: { full_name: 'Thandi Mokoena', membership_number: 'GYM-2026-ABC123', status: 'active', phone: '0821234567' },
  membership: { plan_name: 'Monthly Gold', end_date: '2026-12-31' },
  has_outstanding: false,
  adherence: { visits_30d: 9, expected_30d: 12, label: 'On track' },
  features: ['members', 'checkin', 'classes'],
};

/** Boot the app. `routes` maps "METHOD /api/path" to a reply (or a function of the request). */
function boot(routes = {}, { storage = null } = {}) {
  const calls = [];
  const virtualConsole = new VirtualConsole(); // canvas and navigation "not implemented" notices are expected
  const dom = new JSDOM(read('index.html').replace(/<script src="[^"]+"><\/script>/g, ''), {
    url: 'https://localhost/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole,
  });
  const { window } = dom;
  // A real WebView has these; jsdom's window does not. The QR library needs them.
  window.TextEncoder = TextEncoder;
  window.TextDecoder = TextDecoder;
  if (storage) for (const [k, v] of Object.entries(storage)) window.localStorage.setItem(k, v);

  window.fetch = async (url, init = {}) => {
    const path = String(url).replace('https://yoyogym.vercel.app', '');
    const call = { method: init.method || 'GET', path, headers: init.headers || {}, body: init.body ? JSON.parse(init.body) : null };
    calls.push(call);
    const reply = routes[`${call.method} ${path.split('?')[0]}`];
    if (reply === 'offline') throw new TypeError('Failed to fetch');
    const r = typeof reply === 'function' ? reply(call) : reply || { status: 404, body: { error: 'Not found' } };
    return { ok: r.status < 400, status: r.status, json: async () => r.body };
  };
  window.confirm = () => true;

  for (const f of ['config.js', 'qr-payload.js', 'vendor-qrcode.js', 'member.js', 'app.js']) window.eval(read(f));
  return { window, doc: window.document, calls };
}

const tick = () => new Promise((r) => setTimeout(r, 20));
const text = (doc, sel) => doc.querySelector(sel)?.textContent?.trim() ?? null;

const SIGNED_IN_ROUTES = {
  'GET /api/content': { status: 200, body: { branding: { name: 'BOS GYM', accent_color: '#1e90ff' } } },
  'POST /api/member/login': { status: 200, body: { token: 'tok-bos', member: STATUS.member } },
  'GET /api/member/status': { status: 200, body: STATUS },
  'POST /api/member/checkin': { status: 200, body: { checked_in: true, message: 'Checked in — enjoy your workout!' } },
};

async function signIn(routes = SIGNED_IN_ROUTES) {
  const app = boot(routes);
  app.window.YOYO_MEMBER.open('bos-gym', { name: 'BOS GYM' });
  await tick();
  app.doc.getElementById('m-mn').value = 'GYM-2026-ABC123';
  app.doc.getElementById('m-ph').value = '0821234567';
  app.doc.getElementById('m-login').dispatchEvent(new app.window.Event('submit', { cancelable: true }));
  await tick();
  return app;
}

// ---------------------------------------------------------------------------
// Signing in
// ---------------------------------------------------------------------------

test('SIGNING IN USES THE SAME NUMBER + PHONE, AT THE RIGHT GYM', async () => {
  const { calls } = await signIn();
  const login = calls.find((c) => c.path === '/api/member/login');
  assert.deepEqual(login.body, { membership_number: 'GYM-2026-ABC123', phone: '0821234567' });
  assert.equal(login.headers['X-Gym-Slug'], 'bos-gym', 'the gym travels with the request');
  assert.equal(login.headers.Authorization, undefined, 'no token before signing in');
});

test('after signing in, the home screen says the membership status first', async () => {
  const { doc, calls } = await signIn();
  const status = calls.find((c) => c.path === '/api/member/status');
  assert.equal(status.headers.Authorization, 'Bearer tok-bos');
  assert.match(text(doc, '.m-status'), /Active/);
  assert.match(text(doc, '.m-hello'), /Hi Thandi/);
  assert.match(text(doc, '.m-progress'), /9/);
});

test('a wrong number or phone shows the server\'s own message and keeps what was typed', async () => {
  const app = boot({ ...SIGNED_IN_ROUTES, 'POST /api/member/login': { status: 401, body: { error: 'Those details do not match a member.' } } });
  app.window.YOYO_MEMBER.open('bos-gym', { name: 'BOS GYM' });
  await tick();
  app.doc.getElementById('m-mn').value = 'GYM-2026-XXXXXX';
  app.doc.getElementById('m-ph').value = '0820000000';
  app.doc.getElementById('m-login').dispatchEvent(new app.window.Event('submit', { cancelable: true }));
  await tick();
  assert.equal(text(app.doc, '#m-login-err'), 'Those details do not match a member.');
  assert.equal(app.doc.getElementById('m-mn').value, 'GYM-2026-XXXXXX');
});

test('A SCANNED MEMBER CARD FILLS IN THE NUMBER — AND DOES NOT SIGN IN', async () => {
  // CLAUDE.md §14: a member-ID code names a member; it never authenticates.
  const { window, doc, calls } = boot(SIGNED_IN_ROUTES);
  window.YOYO_MEMBER.open('bos-gym', { number: 'GYM-2026-ABC123' });
  await tick();
  assert.equal(doc.getElementById('m-mn').value, 'GYM-2026-ABC123');
  assert.ok(doc.getElementById('m-ph'), 'the phone is still asked for');
  assert.ok(!calls.some((c) => c.path === '/api/member/login'));
});

test('the gym\'s name arriving late does not wipe what the member typed', async () => {
  let release;
  const slow = new Promise((r) => { release = r; });
  const app = boot({ ...SIGNED_IN_ROUTES, 'GET /api/content': () => ({ status: 200, body: { branding: { name: 'BOS GYM' } } }) });
  app.window.fetch = ((orig) => async (url, init) => { if (String(url).endsWith('/api/content')) await slow; return orig(url, init); })(app.window.fetch);
  app.window.YOYO_MEMBER.open('bos-gym', {});
  app.doc.getElementById('m-mn').value = 'GYM-2026-ABC123';
  release();
  await tick();
  assert.equal(app.doc.getElementById('m-mn').value, 'GYM-2026-ABC123');
  assert.equal(text(app.doc, '.m-hero h1'), 'BOS GYM');
});

// ---------------------------------------------------------------------------
// Checking in — the peak moment
// ---------------------------------------------------------------------------

test('CHECK-IN IS ONE TAP, AND SAYS SO', async () => {
  const { doc, window, calls } = await signIn();
  doc.getElementById('m-checkin').dispatchEvent(new window.Event('click', { bubbles: true }));
  await tick();
  assert.ok(calls.some((c) => c.method === 'POST' && c.path === '/api/member/checkin'));
  assert.match(text(doc, '.m-checkin__label'), /You're in/);
  assert.match(text(doc, '.m-toast'), /Checked in/);
});

test('an inactive membership cannot press check-in, and is told why', async () => {
  const { doc } = await signIn({
    ...SIGNED_IN_ROUTES,
    'GET /api/member/status': { status: 200, body: { ...STATUS, member: { ...STATUS.member, status: 'new' } } },
  });
  assert.equal(doc.getElementById('m-checkin').disabled, true);
  assert.match(text(doc, '.m-hint'), /once your membership is active/);
});

// ---------------------------------------------------------------------------
// The card
// ---------------------------------------------------------------------------

test('THE CARD SHOWS THE NUMBER AND NAME, AND WORKS WITH NO SIGNAL', async () => {
  const first = await signIn();
  const stored = {};
  for (let i = 0; i < first.window.localStorage.length; i++) {
    const k = first.window.localStorage.key(i);
    stored[k] = first.window.localStorage.getItem(k);
  }

  // Next day, at the gym door, no signal.
  const offline = boot(
    { 'GET /api/content': 'offline', 'GET /api/member/status': 'offline' },
    { storage: stored }
  );
  offline.window.YOYO_MEMBER.open('bos-gym', { name: 'BOS GYM' });
  await tick();
  offline.doc.querySelector('[data-tab="card"]').dispatchEvent(new offline.window.Event('click', { bubbles: true }));
  await tick();

  assert.match(text(offline.doc, '.m-pass__no'), /GYM-2026-ABC123/);
  assert.match(text(offline.doc, '.m-pass__name'), /Thandi Mokoena/);
  assert.ok(offline.doc.getElementById('m-qr'), 'the QR is drawn on the phone, not fetched');
});

test('the card carries the same URL the gym\'s scanner reads', () => {
  const member = read('member.js');
  assert.match(member, /'\/g\/' \+ encodeURIComponent\(state\.slug\) \+ '\/p\/m\/'/);
});

// ---------------------------------------------------------------------------
// The plan decides the tabs
// ---------------------------------------------------------------------------

test('A GYM WITHOUT CLASSES HAS NO CLASSES TAB', async () => {
  const { doc } = await signIn({
    ...SIGNED_IN_ROUTES,
    'GET /api/member/status': { status: 200, body: { ...STATUS, features: ['members', 'checkin'] } },
  });
  const tabs = [...doc.querySelectorAll('.m-tab')].map((t) => t.dataset.tab);
  assert.deepEqual(tabs, ['home', 'card', 'profile']);
});

test('booking a class sends the class and the date, and the list redraws', async () => {
  const { doc, window, calls } = await signIn({
    ...SIGNED_IN_ROUTES,
    'GET /api/member/classes': { status: 200, body: { schedule: [
      { class_id: 'c1', name: 'Spin', session_date: '2026-09-25', start_time: '18:00:00', duration_minutes: 45, available: 4, is_full: false, allowed: true, already_booked: false },
    ] } },
    'POST /api/member/book-class': { status: 200, body: { message: 'Booked.' } },
  });
  doc.querySelector('[data-tab="classes"]').dispatchEvent(new window.Event('click', { bubbles: true }));
  await tick();
  assert.match(text(doc, '.m-class'), /Spin/);
  doc.querySelector('[data-book]').dispatchEvent(new window.Event('click', { bubbles: true }));
  await tick();
  const book = calls.find((c) => c.path === '/api/member/book-class');
  assert.deepEqual(book.body, { class_id: 'c1', session_date: '2026-09-25' });
});

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

test('A SESSION THE SERVER NO LONGER ACCEPTS RETURNS TO SIGN-IN', async () => {
  const { doc } = await signIn({ ...SIGNED_IN_ROUTES, 'GET /api/member/status': { status: 401, body: { error: 'Expired' } } });
  assert.ok(doc.getElementById('m-login'), 'back at sign-in');
  assert.match(text(doc, '.m-note'), /sign in again/);
});

test('EACH GYM KEEPS ITS OWN SESSION ON THE PHONE', async () => {
  const { window } = await signIn();
  const keys = Object.keys(window.localStorage);
  assert.ok(keys.includes('yoyo.member.token:bos-gym'));
  assert.ok(!keys.some((k) => k === 'yoyo.member.token'), 'never one slot for every gym');
});

test('signing out forgets the session and the cached card', async () => {
  const { doc, window } = await signIn();
  doc.querySelector('[data-tab="profile"]').dispatchEvent(new window.Event('click', { bubbles: true }));
  doc.querySelector('[data-m="signout"]').dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal(window.localStorage.getItem('yoyo.member.token:bos-gym'), null);
  assert.equal(window.localStorage.getItem('yoyo.member.status:bos-gym'), null);
});

test('a member can ask for their data to be deleted from inside the app', async () => {
  const { doc, window, calls } = await signIn({
    ...SIGNED_IN_ROUTES,
    'POST /api/member/request-deletion': { status: 200, body: { message: 'Recorded.' } },
  });
  doc.querySelector('[data-tab="profile"]').dispatchEvent(new window.Event('click', { bubbles: true }));
  doc.querySelector('[data-m="delete"]').dispatchEvent(new window.Event('click', { bubbles: true }));
  await tick();
  assert.ok(calls.some((c) => c.method === 'POST' && c.path === '/api/member/request-deletion'));
});

// ---------------------------------------------------------------------------
// Safety
// ---------------------------------------------------------------------------

test('A GYM NAME IS TEXT, NOT MARKUP', async () => {
  const { window, doc } = boot({ 'GET /api/content': { status: 200, body: { branding: { name: '<img src=x onerror=alert(1)>' } } } });
  window.YOYO_MEMBER.open('bos-gym', { name: '<img src=x onerror=alert(1)>' });
  await tick();
  assert.equal(doc.querySelector('.m-hero img'), null);
});

test('a slug that is not a slug opens nothing', () => {
  const { window, doc } = boot({});
  window.YOYO_MEMBER.open('../../etc', {});
  assert.ok(doc.getElementById('member').classList.contains('hidden'));
});

test('a colour that is not a colour is not applied', async () => {
  const { window, doc } = boot({ 'GET /api/content': { status: 200, body: { branding: { accent_color: 'red; background:url(x)' } } } });
  window.YOYO_MEMBER.open('bos-gym', {});
  await tick();
  assert.equal(doc.getElementById('member').style.getPropertyValue('--m-accent'), '');
});
