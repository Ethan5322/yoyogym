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
import { readFileSync, existsSync } from 'node:fs';

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

test('the shipped config uses a real deployment address, not an unregistered domain', () => {
  // There is no domain yet. The choice is between an unregistered name —
  // which somebody else can buy, on the list that decides where a member types
  // their ID number — and a Vercel address that is honest about being
  // temporary. The second is safer.
  const config = JSON.parse(readFileSync('apps/mobile/shell.config.json', 'utf8'));

  assert.ok(config.allowedHosts.length > 0, 'the app must be able to navigate somewhere');
  assert.deepEqual(validateShellConfig(config), [], 'and the config must be buildable');

  for (const host of config.allowedHosts) {
    assert.ok(!/^yoyogyms\.com$/.test(host), 'never an unregistered domain');
  }
});

test('the cost of a temporary address is written down, not left to be discovered', () => {
  // An APK built against this address keeps it. Moving to a real domain means
  // a new build, and once the app is on a store, a new review and rollout.
  const config = JSON.parse(readFileSync('apps/mobile/shell.config.json', 'utf8'));
  const notes = config._comment.join(' ');

  assert.match(notes, /KEEPS THIS ADDRESS/i);
  assert.match(notes, /new build/i);
});

// ---------------------------------------------------------------------------
// The QR rules reach the app without being rewritten
// ---------------------------------------------------------------------------

test('THE APP GETS THE QR RULES FROM shared/, GENERATED NOT COPIED', async () => {
  // A hand-written second copy in the shell would drift, and the drift would
  // be silent: the app accepting a payload the platform refuses, or refusing
  // one it should take.
  const { generateQrPayload } = await import('../scripts/mobile/configure-shell.mjs');
  const source = readFileSync('shared/qr-payload.js', 'utf8');
  const generated = generateQrPayload(source);

  assert.match(generated, /GENERATED from shared\/qr-payload\.js/);
  assert.match(generated, /window\.YOYO_QR/);
  assert.ok(!/^export /m.test(generated), 'the shell cannot use ESM exports');
});

test('the generated file still refuses a payload carrying a secret', () => {
  // The rule that matters, surviving the transform.
  const generated = readFileSync('apps/mobile/www/qr-payload.js', 'utf8');

  assert.match(generated, /verification_code/, 'the forbidden list travels with it');
  assert.match(generated, /FORBIDDEN_PARAMS/);
});

test('the generated file says not to edit it', () => {
  const generated = readFileSync('apps/mobile/www/qr-payload.js', 'utf8');
  assert.match(generated, /Do not edit/i);
});

// ---------------------------------------------------------------------------
// The Android project — what the config INTENDS must survive into the manifest
// ---------------------------------------------------------------------------

test('A DEVICE BACKUP MUST NOT CARRY A LIVE SESSION OFF THE PHONE', () => {
  // capacitor.config.ts says this in a comment. Comments do not configure
  // anything: the generated manifest shipped allowBackup="true", which is
  // Android's default and the opposite of what was intended.
  const manifest = readFileSync('apps/mobile/android/app/src/main/AndroidManifest.xml', 'utf8');

  assert.match(manifest, /android:allowBackup="false"/);
  assert.ok(!/android:allowBackup="true"/.test(manifest));
});

test('the camera is declared, not assumed from the plugin', () => {
  // A permission that is merely assumed fails at the gym door rather than at
  // build time.
  const manifest = readFileSync('apps/mobile/android/app/src/main/AndroidManifest.xml', 'utf8');
  assert.match(manifest, /android\.permission\.CAMERA/);
});

test('a phone with no camera can still install the app', () => {
  // The app is useful without one — search by name works. Required="true"
  // would filter those devices out of the store listing for no reason.
  const manifest = readFileSync('apps/mobile/android/app/src/main/AndroidManifest.xml', 'utf8');
  assert.match(manifest, /android\.hardware\.camera"\s+android:required="false"/);
});

test('"USE MY LOCATION" CAN ACTUALLY GET A LOCATION', () => {
  // The button shipped with no location permission declared. Android refuses
  // an undeclared permission without a dialog, so every member was told
  // "search by name instead". Capacitor asks for both, and below Android 12
  // treats anything short of both as a refusal.
  const manifest = readFileSync('apps/mobile/android/app/src/main/AndroidManifest.xml', 'utf8');
  assert.match(manifest, /android\.permission\.ACCESS_COARSE_LOCATION/);
  assert.match(manifest, /android\.permission\.ACCESS_FINE_LOCATION/);
  assert.ok(!/ACCESS_BACKGROUND_LOCATION/.test(manifest), 'a gym picker never needs background location');
  assert.match(manifest, /android\.hardware\.location"\s+android:required="false"/);
});

test('THE ALLOW LIST REACHED THE NATIVE PROJECT', (t) => {
  // shell.config.json is the source of truth, capacitor.config.ts reads it,
  // and `cap sync` copies the result into the app. If that chain breaks, the
  // app can navigate nowhere and nothing says so until it is installed.
  //
  // The native file is a BUILD ARTEFACT and is gitignored — `cap sync`
  // regenerates it. So on a fresh clone, or in CI, it does not exist yet, and
  // a hard failure there would be this test complaining that a generated file
  // has not been generated. Skipped instead, with the reason stated.
  const NATIVE = 'apps/mobile/android/app/src/main/assets/capacitor.config.json';

  if (!existsSync(NATIVE)) {
    return t.skip('not generated yet — run `npm run mobile:sync` in apps/mobile');
  }

  const native = JSON.parse(readFileSync(NATIVE, 'utf8'));
  const shell = JSON.parse(readFileSync('apps/mobile/shell.config.json', 'utf8'));

  assert.deepEqual(native.server.allowNavigation, shell.allowedHosts);
  assert.equal(native.server.androidScheme, 'https', 'a gym wi-fi is not a trusted network');
  assert.equal(native.android.allowMixedContent, false);
  assert.equal(native.android.webContentsDebuggingEnabled, false, 'never in a shipped build');
});

// ---------------------------------------------------------------------------
// "My gym" — the second visit is one tap
// ---------------------------------------------------------------------------

test('THE APP REMEMBERS THE GYM A MEMBER PICKED', () => {
  // Every launch used to start at "Which gym?" and a search.
  const app = readFileSync('apps/mobile/www/app.js', 'utf8');
  const html = readFileSync('apps/mobile/www/index.html', 'utf8');

  assert.match(html, /id="mine"/, 'the home screen has a "your gym" card');
  assert.match(app, /rememberGym\(slug, button\.dataset\.name\)/, 'picking from search remembers it');
  assert.match(app, /rememberGym\(payload\.slug/, 'scanning a gym code remembers it');
});

test('only the gym\'s public identity is remembered, never a session', () => {
  const app = readFileSync('apps/mobile/www/app.js', 'utf8');
  const remember = app.slice(app.indexOf('function rememberGym'), app.indexOf('function myGym'));

  assert.match(remember, /slug: slug, name:/);
  assert.ok(!/token|membership|phone/i.test(remember), 'nothing private goes in');
});

test('a remembered gym can be forgotten, for a shared or handed-down phone', () => {
  const app = readFileSync('apps/mobile/www/app.js', 'utf8');
  assert.match(app, /getElementById\('mine-forget'\)[\s\S]{0,200}forgetGym\(\)/);
});

test('a stored value that is not a slug is ignored, not followed', () => {
  const app = readFileSync('apps/mobile/www/app.js', 'utf8');
  const read = app.slice(app.indexOf('function myGym'), app.indexOf('function forgetGym'));
  assert.match(read, /\[a-z0-9\]\[a-z0-9-\]\{0,47\}/);
});

// ---------------------------------------------------------------------------
// The icon is the gym's brand, not Capacitor's placeholder
// ---------------------------------------------------------------------------

test('THE APP ICON IS NOT CAPACITOR\'S PLACEHOLDER', async () => {
  // The first build shipped the blue-cross-on-a-grid default: the first thing
  // a store reviewer and a gym member would have seen.
  const { createHash } = await import('node:crypto');
  const PLACEHOLDER = '9e029293ab1ae8e3a6a7b7d0b7177e46'; // md5 of the default xxxhdpi icon
  for (const f of ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png']) {
    const png = readFileSync(`apps/mobile/android/app/src/main/res/mipmap-xxxhdpi/${f}`);
    assert.notEqual(createHash('md5').update(png).digest('hex'), PLACEHOLDER, f);
  }
});

test('the icon is drawn from the same brand mark as the web app', () => {
  const script = readFileSync('scripts/mobile/make-icon-sources.mjs', 'utf8');
  assert.match(script, /public\/icon\.svg/);
  assert.match(readFileSync('public/icon.svg', 'utf8'), /#E63946/);
  assert.match(script, /const RED = '#E63946'/);
});
