// The browser's half of "which gym am I in".
//
// A member arrives at /g/bos-gym/register from the app or a scanned QR. From
// then on every API call this tab makes must say which gym, or the server
// falls back to single-gym mode and serves the wrong data.
//
// The slug held here is a HINT, never a credential — for an authenticated
// request the server takes the gym from the signed token and refuses a header
// that disagrees. These tests cover the parsing and the lifetime, which are
// the parts that go wrong quietly.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// A sessionStorage that behaves like the real one, including throwing.
function fakeStorage({ broken = false } = {}) {
  const map = new Map();
  return {
    getItem: (k) => { if (broken) throw new Error('blocked'); return map.has(k) ? map.get(k) : null; },
    setItem: (k, v) => { if (broken) throw new Error('blocked'); map.set(k, String(v)); },
    removeItem: (k) => { if (broken) throw new Error('blocked'); map.delete(k); },
  };
}

let gym;

beforeEach(async () => {
  global.window = { location: { pathname: '/' }, sessionStorage: fakeStorage() };
  // Fresh module each time: it caches the slug in memory on purpose.
  gym = await import(`../src/lib/gym.js?bust=${Math.random()}`);
});

// ---------------------------------------------------------------------------
// Reading the gym out of the path
// ---------------------------------------------------------------------------

test('a /g/<slug>/ path yields the slug', () => {
  assert.equal(gym.slugFromPath('/g/bos-gym/register'), 'bos-gym');
  assert.equal(gym.slugFromPath('/g/bos-gym'), 'bos-gym');
  assert.equal(gym.slugFromPath('/g/bos-gym/member'), 'bos-gym');
});

test('an ordinary path yields nothing — that is single-gym mode', () => {
  // The existing deployment lives entirely on these paths and must not change.
  assert.equal(gym.slugFromPath('/register'), null);
  assert.equal(gym.slugFromPath('/member'), null);
  assert.equal(gym.slugFromPath('/admin/members'), null);
  assert.equal(gym.slugFromPath('/'), null);
});

test('a slug that is not a plain identifier is REFUSED, not cleaned up', () => {
  // It is about to be sent to a server that looks up a tenant with it.
  for (const bad of ['/g/..%2F..%2Fetc/register', '/g/BOS GYM', '/g/a;drop', `/g/${'a'.repeat(60)}`]) {
    assert.equal(gym.slugFromPath(bad), null, `${bad} should be refused`);
  }
});

test('a slug is lower-cased, because a QR may be printed either way', () => {
  assert.equal(gym.slugFromPath('/g/BOS-GYM/register'), 'bos-gym');
});

// ---------------------------------------------------------------------------
// Keeping it for the tab
// ---------------------------------------------------------------------------

test('the gym survives navigation away from /g/', () => {
  // A member goes /g/bos-gym/register -> /member. They are still in that gym.
  global.window.location.pathname = '/g/bos-gym/register';
  gym.captureGym();

  global.window.location.pathname = '/member';
  assert.equal(gym.captureGym(), 'bos-gym');
  assert.equal(gym.currentGymSlug(), 'bos-gym');
});

test('no gym anywhere means single-gym mode, not an error', () => {
  assert.equal(gym.captureGym('/register'), null);
  assert.equal(gym.currentGymSlug(), null);
});

test('signing out forgets the gym', () => {
  gym.captureGym('/g/bos-gym/member');
  assert.equal(gym.currentGymSlug(), 'bos-gym');

  gym.clearGym();
  assert.equal(gym.currentGymSlug(), null);
});

test('a second gym replaces the first, rather than being ignored', () => {
  gym.captureGym('/g/bos-gym/register');
  assert.equal(gym.captureGym('/g/iron-works/register'), 'iron-works');
});

// ---------------------------------------------------------------------------
// Storage that does not work
// ---------------------------------------------------------------------------

test('blocked storage still works for this page load', () => {
  // Private mode, or a browser with site data disabled. Refusing to run would
  // be a worse answer than keeping the gym in memory.
  global.window.sessionStorage = fakeStorage({ broken: true });

  assert.doesNotThrow(() => gym.captureGym('/g/bos-gym/register'));
  assert.equal(gym.currentGymSlug(), 'bos-gym');
});

test('rubbish already in storage is ignored rather than trusted', () => {
  global.window.sessionStorage.setItem('yoyo.gym.slug', '../../etc');
  assert.equal(gym.currentGymSlug(), null);
});
