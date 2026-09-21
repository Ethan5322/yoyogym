// Platform HTTP layer tests, written before the layer.
//
// The gym app authenticates with Bearer tokens held in JavaScript. These pages
// are server-rendered HTML, so the session lives in a COOKIE — which the
// browser attaches automatically, to any request, including one triggered by
// another site. That is CSRF, and it is a risk the gym app simply does not
// have. Most of these tests are about that.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.PLATFORM_JWT_SECRET ||= 'test-only-signing-key-not-used-anywhere';

import {
  sessionCookie,
  clearSessionCookie,
  readSession,
  issueCsrfToken,
  verifyCsrfToken,
  requireSession,
} from '../platform/http.js';

const user = { id: 'staff-1', email: 'owner@yoyogyms.com', kind: 'platform_staff' };

function req({ cookie = '', method = 'GET', url = '/platform/applications' } = {}) {
  return { method, url, headers: cookie ? { cookie } : {} };
}

function res() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    getHeader(k) { return this.headers[k.toLowerCase()]; },
    // Node treats header names case-insensitively, so the stub must too —
    // otherwise writeHead('Location') and getHeader('location') disagree and
    // the test fails on the stub rather than on the code.
    writeHead(code, hdrs) {
      this.statusCode = code;
      for (const [k, v] of Object.entries(hdrs || {})) this.headers[k.toLowerCase()] = v;
      return this;
    },
    end(b) { this.body = b || ''; this.ended = true; return this; },
  };
}

// ---------------------------------------------------------------------------
// Session cookie
// ---------------------------------------------------------------------------
test('the session cookie is HttpOnly, Secure, SameSite=Strict and scoped', () => {
  const cookie = sessionCookie(user);

  assert.match(cookie, /HttpOnly/i, 'JavaScript must not be able to read the session');
  assert.match(cookie, /Secure/i, 'never sent over plain HTTP');
  assert.match(cookie, /SameSite=Strict/i, 'the first line of defence against CSRF');
  assert.match(cookie, /Path=\/platform/, 'not sent to the gym app at all');
});

test('a valid cookie round-trips to the signed-in user', () => {
  const cookie = sessionCookie(user);
  const value = cookie.split(';')[0];
  const session = readSession(req({ cookie: value }));

  assert.equal(session.sub, 'staff-1');
  assert.equal(session.aud, 'platform');
});

test('a tampered cookie is rejected, not trusted', () => {
  const cookie = sessionCookie(user).split(';')[0];
  const tampered = cookie.slice(0, -4) + 'aaaa';

  assert.equal(readSession(req({ cookie: tampered })), null);
});

test('no cookie means no session, without throwing', () => {
  assert.equal(readSession(req()), null);
  assert.equal(readSession({ headers: {} }), null);
  assert.equal(readSession({}), null);
});

test('signing out sends an immediately-expired cookie', () => {
  const cookie = clearSessionCookie();
  assert.match(cookie, /Max-Age=0/i);
  assert.match(cookie, /HttpOnly/i);
});

// ---------------------------------------------------------------------------
// CSRF — the risk that arrives with cookies
// ---------------------------------------------------------------------------
test('a CSRF token is bound to the session, so one user cannot use another one', () => {
  const mine = issueCsrfToken('staff-1');
  const theirs = issueCsrfToken('staff-2');

  assert.equal(verifyCsrfToken(mine, 'staff-1'), true);
  assert.equal(verifyCsrfToken(mine, 'staff-2'), false, "another session's token must not work");
  assert.notEqual(mine, theirs);
});

test('a missing or malformed CSRF token is rejected', () => {
  for (const bad of ['', null, undefined, 'nonsense', 'a.b.c']) {
    assert.equal(verifyCsrfToken(bad, 'staff-1'), false, `rejects ${JSON.stringify(bad)}`);
  }
});

test('an expired CSRF token is rejected', () => {
  const old = issueCsrfToken('staff-1', { issuedAt: Date.now() - 25 * 60 * 60 * 1000 });
  assert.equal(verifyCsrfToken(old, 'staff-1'), false);
});

// ---------------------------------------------------------------------------
// The guard
// ---------------------------------------------------------------------------
test('an unauthenticated page request is redirected to sign in', () => {
  const r = res();
  const session = requireSession(req(), r);

  assert.equal(session, null);
  assert.equal(r.statusCode, 302);
  assert.equal(r.headers.location, '/platform/login');
});

test('an authenticated request passes through', () => {
  const cookie = sessionCookie(user).split(';')[0];
  const r = res();
  const session = requireSession(req({ cookie }), r);

  assert.ok(session);
  assert.equal(session.sub, 'staff-1');
  assert.ok(!r.ended, 'nothing is written when the request is allowed');
});

test('a POST without a valid CSRF token is refused even with a good session', () => {
  const cookie = sessionCookie(user).split(';')[0];
  const r = res();

  const session = requireSession(req({ cookie, method: 'POST' }), r, { csrfToken: 'forged' });

  assert.equal(session, null, 'a valid session is NOT enough for a state-changing request');
  assert.equal(r.statusCode, 403);
});

test('a POST with the right CSRF token proceeds', () => {
  const cookie = sessionCookie(user).split(';')[0];
  const token = issueCsrfToken('staff-1');
  const r = res();

  const session = requireSession(req({ cookie, method: 'POST' }), r, { csrfToken: token });

  assert.ok(session);
  assert.ok(!r.ended);
});
