// Where sessions live (CLAUDE.md §46.1 Q1): on the website, an HttpOnly cookie
// per gym that no script can read, adopted by the routers, and useless to
// another site; in the app, the phone's Keychain / Keystore.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import { TextEncoder, TextDecoder } from 'node:util';

process.env.JWT_SECRET ||= 'test-only-gym-secret';

const { issueSessionCookie, clearSessionCookie, adoptSessionCookie, cookieName, PAGE_HEADER } = await import('../server/lib/session-cookie.js');
const { signToken } = await import('../server/lib/auth.js');

function res() {
  const r = { headers: {}, code: 0, body: '' };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.getHeader = (k) => r.headers[k.toLowerCase()];
  return r;
}
const json = (r, code, body) => { r.code = code; r.body = body; };

test('a sign-in from a Yoyo Gyms page keeps the session in an HttpOnly, Secure, SameSite cookie for its gym', () => {
  const token = signToken({ id: 'a1', username: 'owner', role: 'owner' }, { gym: 'bos-gym' });
  const r = res();
  const req = { headers: { [PAGE_HEADER]: '1', 'x-gym-slug': 'bos-gym' } };
  assert.equal(issueSessionCookie(req, r, 'admin', token), true);
  const [cookie] = r.headers['set-cookie'];
  assert.match(cookie, new RegExp(`^${cookieName('admin', 'bos-gym')}=${token.replace(/\./g, '\\.')};`));
  for (const part of ['Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax']) assert.match(cookie, new RegExp(part));
  const maxAge = Number(/Max-Age=(\d+)/.exec(cookie)[1]);
  assert.ok(maxAge > 7 * 3600 && maxAge <= 8 * 3600, `the cookie lasts as long as the session: ${maxAge}`);
});

test('without the page header — another site, or the store app — no cookie is set', () => {
  const token = signToken({ id: 'a1', username: 'owner', role: 'owner' });
  const r = res();
  assert.equal(issueSessionCookie({ headers: {} }, r, 'admin', token), false);
  assert.equal(r.headers['set-cookie'], undefined);
});

test('signing out removes the cookie — only the server can', () => {
  const r = res();
  clearSessionCookie({ headers: { 'x-gym-slug': 'bos-gym' } }, r, 'member');
  assert.match(r.headers['set-cookie'][0], /^yoyo_member__bos-gym=; .*Max-Age=0/);
});

test('the router takes the cookie as the session, for reading', () => {
  const req = { method: 'GET', headers: { cookie: `${cookieName('admin')}=abc.def.ghi` } };
  assert.equal(adoptSessionCookie(req, res(), 'admin', json), true);
  assert.equal(req.headers.authorization, 'Bearer abc.def.ghi');
});

test('a change carried by the cookie must come from a Yoyo Gyms page (CSRF)', () => {
  const forged = { method: 'POST', headers: { cookie: `${cookieName('admin')}=abc.def.ghi` } };
  const r = res();
  assert.equal(adoptSessionCookie(forged, r, 'admin', json), false);
  assert.equal(r.code, 403);
  assert.equal(forged.headers.authorization, undefined);

  const ours = { method: 'POST', headers: { cookie: `${cookieName('admin')}=abc.def.ghi`, [PAGE_HEADER]: '1' } };
  assert.equal(adoptSessionCookie(ours, res(), 'admin', json), true);
  assert.equal(ours.headers.authorization, 'Bearer abc.def.ghi');
});

test('a caller with its own token (the store app) is never given the cookie', () => {
  const req = { method: 'POST', headers: { authorization: 'Bearer from-the-app', cookie: `${cookieName('member')}=from-a-cookie` } };
  assert.equal(adoptSessionCookie(req, res(), 'member', json), true);
  assert.equal(req.headers.authorization, 'Bearer from-the-app');
});

test('every gym API router adopts the cookie, and sign-in handlers set it', () => {
  for (const [file, kind] of [['api/admin/[...path].js', 'admin'], ['api/auth/[...path].js', 'admin'], ['api/member/[...path].js', 'member']]) {
    assert.match(readFileSync(file, 'utf8'), new RegExp(`adoptSessionCookie\\(req, res, '${kind}', json\\)`), file);
  }
  for (const file of ['server/handlers/auth/login.js', 'server/handlers/auth/face-login.js', 'server/handlers/auth/owner-login.js', 'server/handlers/member/login.js', 'server/handlers/member/face-login.js']) {
    assert.match(readFileSync(file, 'utf8'), /issueSessionCookie\(req, res, '(admin|member)'/, file);
  }
});

test('the website never keeps a session where a script could read it', () => {
  const api = readFileSync('src/lib/api.js', 'utf8');
  const memberApi = readFileSync('src/lib/memberApi.js', 'utf8');
  for (const src of [api, memberApi]) {
    assert.doesNotMatch(src, /localStorage\.setItem\([^)]*token/i);
    assert.doesNotMatch(src, /Authorization/);
    assert.match(src, /PAGE_HEADERS/);
  }
  // Sessions from before the cookie are removed from the browser.
  assert.match(api, /forgetStoredSessions\(\);/);
  assert.doesNotMatch(readFileSync('src/pages/OwnerLogin.jsx', 'utf8'), /localStorage\.setItem\(tokenKey/);
});

// ---------------------------------------------------------------------------
// The app: the phone's secure storage
// ---------------------------------------------------------------------------

function bootApp(storage = {}) {
  const read = (f) => readFileSync('apps/mobile/www/' + f, 'utf8');
  const dom = new JSDOM(read('index.html').replace(/<script src="[^"]+"><\/script>/g, ''), {
    url: 'https://localhost/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole(),
  });
  const { window } = dom;
  window.TextEncoder = TextEncoder;
  window.TextDecoder = TextDecoder;
  window.alert = () => {};
  for (const [k, v] of Object.entries(storage)) window.localStorage.setItem(k, v);
  const vault = new Map();
  window.Capacitor = {
    Plugins: {
      SecureStorage: {
        internalGetItem: async ({ prefixedKey }) => ({ data: vault.has(prefixedKey) ? vault.get(prefixedKey) : null }),
        internalSetItem: async ({ prefixedKey, data }) => { vault.set(prefixedKey, data); },
        internalRemoveItem: async ({ prefixedKey }) => ({ success: vault.delete(prefixedKey) }),
      },
    },
  };
  const calls = [];
  window.fetch = async (url, init = {}) => {
    const path = String(url).replace('https://yoyogym.vercel.app', '').split('?')[0];
    calls.push({ path, auth: (init.headers || {}).Authorization || null });
    const routes = {
      '/api/content': { branding: { name: 'BOS GYM' } },
      '/api/catalog': { plans: [], addons: [] },
      '/api/member/login': { token: 'tok-bos', member: { id: 'm1' } },
      '/api/member/status': { member: { full_name: 'Thandi Mokoena', status: 'active', membership_number: 'GYM-1' }, membership: {}, features: ['members'] },
    };
    const body = routes[path];
    return { ok: Boolean(body), status: body ? 200 : 404, json: async () => body || {} };
  };
  for (const f of ['config.js', 'qr-payload.js', 'vendor-qrcode.js', 'member.js', 'app.js']) window.eval(read(f));
  return { window, doc: window.document, vault, calls };
}
const tick = () => new Promise((r) => setTimeout(r, 30));

test('in the app, the sign-in goes to the Keychain / Keystore — not the web storage', async () => {
  const app = bootApp();
  app.window.YOYO_MEMBER.open('bos-gym', { name: 'BOS GYM' });
  await tick();
  app.doc.getElementById('m-mn').value = 'GYM-1';
  app.doc.getElementById('m-ph').value = '0821234567';
  app.doc.getElementById('m-login').dispatchEvent(new app.window.Event('submit', { cancelable: true }));
  await tick();
  assert.equal(app.vault.get('yoyo_member_token_bos-gym'), 'tok-bos');
  assert.equal(app.window.localStorage.getItem('yoyo.member.token:bos-gym'), null);
  assert.equal(app.window.localStorage.getItem('yoyo.member.signedin:bos-gym'), 'true');
  assert.equal(app.window.YOYO_MEMBER.hasSession('bos-gym'), true);
});

test('reopening reads the sign-in from secure storage, and a sign-in from before is moved there', async () => {
  const app = bootApp({ 'yoyo.member.token:bos-gym': JSON.stringify('old-token') });
  app.window.YOYO_MEMBER.open('bos-gym', { name: 'BOS GYM' });
  await tick();
  assert.equal(app.vault.get('yoyo_member_token_bos-gym'), 'old-token');
  assert.equal(app.window.localStorage.getItem('yoyo.member.token:bos-gym'), null, 'no longer in web storage');
  const status = app.calls.find((c) => c.path === '/api/member/status');
  assert.equal(status.auth, 'Bearer old-token');
});

test('a sign-in never uses an old cookie, so a session the server dropped cannot block signing in again', () => {
  for (const file of ['api/auth/[...path].js', 'api/member/[...path].js']) {
    const src = readFileSync(file, 'utf8');
    assert.match(src, /if \(!SIGN_INS\.has\(seg\) && !adoptSessionCookie\(/, file);
    assert.match(src, /const SIGN_INS = new Set\(\['login', 'face-login'/, file);
  }
});
