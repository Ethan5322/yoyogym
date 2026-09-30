// Every request from a gym's screens names the gym, and every gym keeps its
// own session.
//
// Three requests did not name their gym — the member portal client, the QR
// scan logger and the public profile page. A request without the gym is
// single-gym mode, which reads the DEFAULT schema: a member of any gym but
// the first signed in against the first gym's members.
//
// And one fixed storage key served every gym on the shared origin, so signing
// in to gym B signed you out of gym A.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// ---- a browser, just enough of one ----------------------------------------
function storage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    keys: () => [...m.keys()],
  };
}

const sent = [];
globalThis.window = { location: { pathname: '/', search: '' }, sessionStorage: storage() };
globalThis.localStorage = storage();
globalThis.fetch = async (url, init = {}) => {
  sent.push({ url, headers: init.headers || {} });
  return { ok: true, status: 200, json: async () => ({}) };
};

const gym = await import('../src/lib/gym.js');
const { tokenKey } = await import('../src/lib/api.js');
const { memberFetch } = await import('../src/lib/memberApi.js');
// The session itself is now a per-gym HttpOnly cookie (CLAUDE.md §46.1 Q1).
const { cookieName, adoptSessionCookie } = await import('../server/lib/session-cookie.js');

function at(pathname) {
  gym.clearGym();
  window.location.pathname = pathname;
}

beforeEach(() => {
  sent.length = 0;
});

// ---------------------------------------------------------------------------
// The gym travels with every request
// ---------------------------------------------------------------------------

test('THE MEMBER PORTAL NAMES ITS GYM ON SIGN-IN', async () => {
  at('/g/bos-gym/member');
  await memberFetch('/member/login', { method: 'POST', body: {}, auth: false });

  assert.equal(sent[0].headers['X-Gym-Slug'], 'bos-gym');
});

test('single-gym mode sends no gym, exactly as before', async () => {
  at('/member');
  await memberFetch('/member/login', { method: 'POST', body: {}, auth: false });

  assert.equal('X-Gym-Slug' in sent[0].headers, false);
});

test('the gym is known on the FIRST render, before App has captured it', () => {
  // captureGym() runs in App's effect, after the children render.
  at('/g/iron-works/admin');
  assert.equal(gym.currentGymSlug(), 'iron-works');
});

test('the QR scan logger and public profile name their gym', () => {
  // Both are fire-and-forget fetches outside the two clients.
  for (const file of ['src/lib/scan.js', 'src/pages/PublicProfile.jsx']) {
    assert.match(readFileSync(file, 'utf8'), /gymHeaders\(\)/, `${file} must send the gym`);
  }
});

test('no request in the gym app bypasses the gym header', () => {
  // A raw fetch to /api that is not in one of the two clients must carry
  // gymHeaders() — this is how the three above were missed.
  const files = [
    'src/lib/scan.js',
    'src/pages/PublicProfile.jsx',
  ];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const raw = source.match(/fetch\(`?['"`]?\/api/g) || [];
    const withGym = source.match(/gymHeaders\(\)/g) || [];
    assert.ok(withGym.length >= raw.length, `${file}: every /api fetch sends the gym`);
  }
});

// ---------------------------------------------------------------------------
// One session per gym
// ---------------------------------------------------------------------------

// The session is a cookie per gym, named after the gym the page asks for
// (CLAUDE.md §46.1 Q1): the cookie for one gym is never adopted at another.
function adopted(kind, cookies, slug) {
  const req = { method: 'GET', headers: { cookie: cookies, ...(slug ? { 'x-gym-slug': slug } : {}) } };
  adoptSessionCookie(req, {}, kind, () => {});
  return req.headers.authorization || null;
}

test('EACH GYM KEEPS ITS OWN SESSION', () => {
  const jar = `${cookieName('member', 'bos-gym')}=token-for-bos; ${cookieName('member', 'iron-works')}=token-for-iron`;
  assert.equal(adopted('member', jar, 'bos-gym'), 'Bearer token-for-bos', 'signing in at iron-works did not sign out of bos-gym');
  assert.equal(adopted('member', jar, 'iron-works'), 'Bearer token-for-iron');
});

test('staff sessions are per gym too', () => {
  const jar = `${cookieName('admin', 'bos-gym')}=staff-bos`;
  assert.equal(adopted('admin', jar, 'iron-works'), null, 'another gym has no session here');
  assert.equal(adopted('member', jar, 'bos-gym'), null, 'a staff session is not a member session');
});

test('single-gym mode keeps the ORIGINAL keys, so nobody there is signed out', () => {
  at('/admin');
  assert.equal(tokenKey('gym_admin_token'), 'gym_admin_token');
  assert.equal(tokenKey('gym_member_token'), 'gym_member_token');
});
