// The app shell's allow list.
//
// This list decides where the app may send a gym member — someone who is about
// to type their ID number and phone number into a form. Getting it wrong is
// not a build problem, it is a member entering personal details somewhere the
// app did not intend.
//
// The generator refuses rather than warns, so these tests are mostly about
// what it must refuse.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { validateShellConfig, generate } from '../scripts/mobile/configure-shell.mjs';

const good = (over = {}) => ({
  allowedHosts: ['yoyogyms.com'],
  defaultServer: 'https://yoyogyms.com',
  adminHost: 'admin.yoyogyms.com',
  supportContact: 'MuleSoo',
  ...over,
});

test('a complete config passes', () => {
  assert.deepEqual(validateShellConfig(good()), []);
});

// ---------------------------------------------------------------------------
// The staff panel
// ---------------------------------------------------------------------------

test('THE ADMIN HOST MUST NOT BE IN THE ALLOW LIST', () => {
  // A member WebView that can open the staff panel is a WebView pointed at the
  // wrong threat model. Staff reach the panel in a browser.
  const problems = validateShellConfig(
    good({ allowedHosts: ['yoyogyms.com', 'admin.yoyogyms.com'] })
  );

  assert.equal(problems.length, 1);
  assert.match(problems[0], /must NOT be reachable/);
});

// ---------------------------------------------------------------------------
// Refusing to ship something broken
// ---------------------------------------------------------------------------

test('an empty allow list is refused, not shipped as "no restrictions"', () => {
  const problems = validateShellConfig(good({ allowedHosts: [] }));
  assert.match(problems[0], /navigate nowhere/);
});

test('a wildcard-everything allow list is refused', () => {
  // With "*" the WebView follows any link anywhere, inside the app's own
  // chrome — so one injected link becomes a convincing place to ask for an ID.
  const problems = validateShellConfig(good({ allowedHosts: ['*'] }));
  assert.ok(problems.length > 0);
});

test('a URL where a hostname belongs is refused', () => {
  const problems = validateShellConfig(good({ allowedHosts: ['https://yoyogyms.com/platform'] }));
  assert.match(problems[0], /bare hostname/);
});

test('plain http is refused — a gym wi-fi is not a trusted network', () => {
  const problems = validateShellConfig(
    good({ defaultServer: 'http://yoyogyms.com', allowedHosts: ['yoyogyms.com'] })
  );
  assert.match(problems[0], /https/);
});

test('a default server outside the allow list is caught before it ships', () => {
  // Otherwise the app opens and is immediately blocked by its own config.
  const problems = validateShellConfig(good({ defaultServer: 'https://elsewhere.com' }));
  assert.match(problems.join(' '), /not in allowedHosts/);
});

test('a missing default server is refused rather than opening a blank screen', () => {
  const problems = validateShellConfig(good({ defaultServer: '' }));
  assert.match(problems.join(' '), /blank screen/);
});

// ---------------------------------------------------------------------------
// What it generates
// ---------------------------------------------------------------------------

test('the generated config is frozen, so a page script cannot widen it', () => {
  const out = generate(good());

  assert.match(out, /Object\.freeze/);
  assert.match(out, /yoyogyms\.com/);
  assert.match(out, /GENERATED/, 'and says not to edit it by hand');
});

// ---------------------------------------------------------------------------
// The config as it actually stands in the repository
// ---------------------------------------------------------------------------

test('the shipped config is deliberately incomplete, and says why', () => {
  // yoyogyms.com is not registered. An unregistered domain sitting in an allow
  // list is a name somebody else can buy — and this list is what decides where
  // a member types their ID number. The build refuses until a real address is
  // put in, which is the intended state, not an oversight.
  const config = JSON.parse(readFileSync('apps/mobile/shell.config.json', 'utf8'));

  assert.deepEqual(config.allowedHosts, [], 'no placeholder domains are shipped');
  assert.ok(validateShellConfig(config).length > 0, 'so the build refuses');
  assert.ok(
    config._comment.join(' ').includes('NOT registered'),
    'and the file explains it rather than looking like a mistake'
  );
});
