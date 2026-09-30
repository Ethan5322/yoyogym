// No payment inside the store app (CLAUDE.md §46.1 Q4): the app's web view
// says who it is, and the website leaves out the Yoyo subscription's prices,
// Pay button and card; the gym admin panel stops pointing to an upgrade; and
// applying opens the phone's browser. A browser outside the app is unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import { TextEncoder, TextDecoder } from 'node:util';

process.env.PLATFORM_JWT_SECRET ||= 'test-only-signing-key-not-used-anywhere';

const { handlePlatform } = await import('../platform/router.js');
const { sessionCookie } = await import('../platform/http.js');
const { isStoreApp, STORE_APP_MARK } = await import('../shared/store-app.js');

const APP_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/128 Mobile Safari/537.36 YoyoGymsApp';
const BROWSER_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/128 Mobile Safari/537.36';
const OWNER = { id: 'owner-1', email: 'ann@bos.co', kind: 'gym_owner' };

function call({ method = 'GET', url = '/platform/my-gym', ua = BROWSER_UA, body = '' } = {}) {
  const req = {
    method, url,
    headers: { cookie: sessionCookie(OWNER).split(';')[0], 'user-agent': ua, 'content-type': 'application/x-www-form-urlencoded' },
    _body: body,
  };
  req[Symbol.asyncIterator] = async function* () { if (req._body) yield Buffer.from(req._body); };
  const res = {
    req, statusCode: 200, headers: {}, body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    getHeader(k) { return this.headers[k.toLowerCase()]; },
    writeHead(code, h) { this.statusCode = code; for (const [k, v] of Object.entries(h || {})) this.headers[k.toLowerCase()] = v; return this; },
    end(b) { this.body = b || ''; return this; },
  };
  return { req, res };
}

function deps(calls = []) {
  return {
    audit: async () => {},
    permissionsFor: async () => [],
    ownerDashboard: async () => ({
      application: { id: 'app-1', applicant_user_id: 'owner-1', proposed_gym_name: 'BOS GYM', status: 'approved' },
      gym: { id: 'g1', slug: 'bos-gym', search_name: 'BOS GYM', status: 'active', plan_key: 'basic' },
      subscription: { status: 'trialing', trial_ends_at: '2026-10-30T00:00:00Z', card_last4: '4242', card_brand: 'visa' },
      documents: [],
    }),
    startPayment: async (...a) => { calls.push(a); return { url: 'https://checkout.paystack.com/x' }; },
  };
}

test('the app\'s mark in the user agent is recognised, and nothing else is', () => {
  assert.equal(isStoreApp(APP_UA), true);
  assert.equal(isStoreApp(BROWSER_UA), false);
  assert.equal(isStoreApp(undefined), false);
  const config = readFileSync('apps/mobile/capacitor.config.ts', 'utf8');
  assert.match(config, new RegExp(`appendUserAgent: '${STORE_APP_MARK}'`));
});

test('in a browser the owner page still offers Pay now and shows the card', async () => {
  const { req, res } = call();
  await handlePlatform(req, res, deps());
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /Pay now/);
  assert.match(res.body, /ending 4242/);
  assert.doesNotMatch(res.body, /<body data-store-app/);
});

test('inside the app the owner page shows the status only — no Pay button, no card', async () => {
  const { req, res } = call({ ua: APP_UA });
  await handlePlatform(req, res, deps());
  assert.equal(res.statusCode, 200);
  assert.doesNotMatch(res.body, /Pay now|my-gym\/pay|Paystack|ending 4242/);
  assert.match(res.body, /<body data-store-app/);
  assert.match(res.body, /Open your gym admin panel/);
});

test('a payment can never be started from inside the app', async () => {
  const calls = [];
  const { req, res } = call({ method: 'POST', url: '/platform/my-gym/pay', ua: APP_UA, body: 'csrf=x' });
  await handlePlatform(req, res, deps(calls));
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.location, '/platform/my-gym');
  assert.equal(calls.length, 0);
});

test('plan prices are marked to be hidden inside the app', () => {
  const views = readFileSync('platform/views.js', 'utf8');
  // Both places a plan's price is drawn: the apply page and the welcome page.
  assert.equal((views.match(/class="plan-price store-hide"/g) || []).length, 2);
  assert.doesNotMatch(views, /class="plan-price"/);
  assert.match(views, /\[data-store-app\] \.store-hide \{ display:none !important; \}/);
});

test('the gym admin panel does not point to an upgrade inside the app', () => {
  const notice = readFileSync('src/components/UpgradeNotice.jsx', 'utf8');
  assert.match(notice, /isOwner && !inStoreApp && \(/);
  assert.match(readFileSync('src/pages/admin/Settings.jsx', 'utf8'), /isStoreApp\(navigator\.userAgent\)\s*\?\s*'Not in your Yoyo Gyms plan\.'/);
});

test('applying to join opens the phone\'s browser, not the app', async () => {
  const read = (f) => readFileSync('apps/mobile/www/' + f, 'utf8');
  const dom = new JSDOM(read('index.html').replace(/<script src="[^"]+"><\/script>/g, ''), {
    url: 'https://localhost/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole(),
  });
  const { window } = dom;
  window.TextEncoder = TextEncoder;
  window.TextDecoder = TextDecoder;
  const opened = [];
  window.Capacitor = { Plugins: { Browser: { open: async (o) => { opened.push(o.url); } } } };
  window.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
  for (const f of ['config.js', 'qr-payload.js', 'vendor-qrcode.js', 'member.js', 'app.js']) window.eval(read(f));
  const click = (sel) => window.document.querySelector(sel).dispatchEvent(new window.Event('click', { bubbles: true }));
  click('[data-go="owner"]');
  click('#owner-welcome [data-go="owner-apply"]');
  click('#owner-apply [data-go="owner-register"]');
  assert.deepEqual(opened, ['https://yoyogym.vercel.app/platform/apply']);
  assert.equal(window.location.href, 'https://localhost/', 'the app itself did not navigate');
});
