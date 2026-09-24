// The app talking to its own server.
//
// Capacitor serves the app from https://localhost (Android) and
// capacitor://localhost (iPhone), so every call to the server is cross-origin
// and the WebView enforces CORS. There were no CORS headers anywhere: the
// app's gym search and "which gym did I join?" were blocked on a real phone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.PLATFORM_JWT_SECRET ||= 'test-only-platform-secret-distinct';

import { applyAppCors, APP_ORIGINS } from '../shared/cors.js';
import { handlePlatform } from '../platform/router.js';

function res() {
  return {
    statusCode: 200, headers: {}, body: '', ended: false,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    getHeader(k) { return this.headers[k.toLowerCase()]; },
    writeHead(code, h) { this.statusCode = code; for (const [k, v] of Object.entries(h || {})) this.headers[k.toLowerCase()] = v; return this; },
    end(b) { this.body = b || ''; this.ended = true; return this; },
  };
}

test('BOTH APP ORIGINS ARE ALLOWED — ANDROID AND IPHONE', () => {
  for (const origin of ['https://localhost', 'capacitor://localhost']) {
    const r = res();
    applyAppCors({ method: 'GET', headers: { origin } }, r);
    assert.equal(r.headers['access-control-allow-origin'], origin);
  }
});

test('any other origin gets NO CORS headers, and is blocked as before', () => {
  for (const origin of ['https://evil.example', 'https://localhost.evil.example', 'null', '']) {
    const r = res();
    applyAppCors({ method: 'GET', headers: { origin } }, r);
    assert.equal(r.headers['access-control-allow-origin'], undefined, origin);
  }
});

test('CREDENTIALS ARE NEVER ALLOWED — so no cookie can ride along', () => {
  // The staff panel is cookie-authenticated. Allow-Credentials is what would
  // let a cross-origin request carry that cookie; it is never sent.
  const r = res();
  applyAppCors({ method: 'GET', headers: { origin: 'https://localhost' } }, r);
  assert.equal(r.headers['access-control-allow-credentials'], undefined);
});

test('a preflight is answered and stops there', () => {
  const r = res();
  const handled = applyAppCors({ method: 'OPTIONS', headers: { origin: 'capacitor://localhost' } }, r);
  assert.equal(handled, true);
  assert.equal(r.statusCode, 204);
  assert.match(r.headers['access-control-allow-headers'], /Authorization/);
  assert.match(r.headers['access-control-allow-headers'], /X-Gym-Slug/);
});

test('every response varies by Origin, so a cache cannot mix them up', () => {
  const r = res();
  applyAppCors({ method: 'GET', headers: {} }, r);
  assert.equal(r.headers.vary, 'Origin');
});

// ---------------------------------------------------------------------------
// Where it applies
// ---------------------------------------------------------------------------

test('THE APP\'S GYM SEARCH IS READABLE FROM THE APP', async () => {
  const r = res();
  await handlePlatform(
    { method: 'GET', url: '/platform/api/gyms?q=bos', headers: { origin: 'https://localhost' } },
    r,
    { searchGyms: async () => [{ slug: 'bos-gym', name: 'BOS GYM' }] }
  );
  assert.equal(r.statusCode, 200);
  assert.equal(r.headers['access-control-allow-origin'], 'https://localhost');
});

test('THE STAFF PANEL\'S COOKIE PAGES NEVER GET CORS', async () => {
  const r = res();
  await handlePlatform({ method: 'GET', url: '/platform/login', headers: { origin: 'https://localhost' } }, r, {});
  assert.equal(r.headers['access-control-allow-origin'], undefined);
});

test('the gym routers the app uses apply it; the staff API does not', () => {
  assert.match(readFileSync('api/[...path].js', 'utf8'), /if \(applyAppCors\(req, res\)\) return;/);
  assert.match(readFileSync('api/member/[...path].js', 'utf8'), /if \(applyAppCors\(req, res\)\) return;/);
  assert.ok(!/applyAppCors/.test(readFileSync('api/admin/[...path].js', 'utf8')), 'the app never calls the staff API');
});

// ---------------------------------------------------------------------------
// The iPhone scheme, and location on the web
// ---------------------------------------------------------------------------

test('THE IPHONE APP DOES NOT USE A SCHEME WKWEBVIEW REFUSES', () => {
  // iosScheme: 'https' is documented by Capacitor as impossible — WKWebView
  // handles http/https itself and refuses a custom handler for them.
  const config = readFileSync('apps/mobile/capacitor.config.ts', 'utf8');
  assert.ok(!/iosScheme:\s*'https?'/.test(config));
  assert.ok(APP_ORIGINS.includes('capacitor://localhost'), 'and its default origin is allowed');
});

test('THE WEB GYM FINDER CAN ASK FOR A LOCATION', () => {
  // Permissions-Policy geolocation=() switched it off for every page the
  // server sends, so "near me" on /platform/find could never work.
  const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));
  const policy = vercel.headers.flatMap((h) => h.headers).find((h) => h.key === 'Permissions-Policy').value;
  assert.match(policy, /geolocation=\(self\)/);
  assert.match(policy, /microphone=\(\)/, 'the microphone stays off');
});
