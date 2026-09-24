// The app behaving like an app: the QR scanner, Android's back button, the
// status bar and splash, no-signal handling, and the iPhone permission strings.
//
// THE SCANNER NEVER WORKED IN A BUILT APP. The code called another plugin's
// API (BarcodeScanner.checkPermissions / scan) while the installed one is
// CapacitorBarcodeScanner.scanBarcode(). These tests drive the installed API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import { TextEncoder, TextDecoder } from 'node:util';

const WWW = 'apps/mobile/www/';
const read = (f) => readFileSync(WWW + f, 'utf8');
const tick = () => new Promise((r) => setTimeout(r, 20));
const text = (doc, sel) => doc.querySelector(sel)?.textContent?.trim() ?? null;
const click = (doc, window, sel) => doc.querySelector(sel).dispatchEvent(new window.Event('click', { bubbles: true }));

const ROUTES = {
  'GET /api/content': { status: 200, body: { branding: { name: 'BOS GYM' } } },
};

function boot({ plugins = null, routes = ROUTES } = {}) {
  const calls = [];
  const dom = new JSDOM(read('index.html').replace(/<script src="[^"]+"><\/script>/g, ''), {
    url: 'https://localhost/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
  });
  const { window } = dom;
  window.TextEncoder = TextEncoder;
  window.TextDecoder = TextDecoder;
  window.confirm = () => true;
  window.alert = () => {};
  window.fetch = async (url, init = {}) => {
    const path = String(url).replace('https://yoyogym.vercel.app', '');
    calls.push({ method: init.method || 'GET', path });
    const r = routes[`${init.method || 'GET'} ${path.split('?')[0]}`] || { status: 404, body: {} };
    return { ok: r.status < 400, status: r.status, json: async () => r.body };
  };
  if (plugins) window.Capacitor = { Plugins: plugins };
  for (const f of ['config.js', 'qr-payload.js', 'vendor-qrcode.js', 'member.js', 'app.js']) window.eval(read(f));
  return { window, doc: window.document, calls };
}

// ---------------------------------------------------------------------------
// The scanner
// ---------------------------------------------------------------------------

async function scan(outcome) {
  const scanCalls = [];
  const plugins = {
    CapacitorBarcodeScanner: {
      scanBarcode: async (opts) => {
        scanCalls.push(opts);
        if (outcome instanceof Error) throw outcome;
        return { ScanResult: outcome, format: 0 };
      },
    },
  };
  const app = boot({ plugins });
  click(app.doc, app.window, '[data-go="member-signin"]');
  click(app.doc, app.window, '#scan');
  await tick();
  return { ...app, scanCalls };
}

test('THE SCANNER CALLS THE PLUGIN THAT IS INSTALLED, FOR QR CODES', async () => {
  const { scanCalls } = await scan('https://yoyogym.vercel.app/g/bos-gym');
  assert.equal(scanCalls.length, 1, 'the plugin was found and called');
  assert.equal(scanCalls[0].hint, 0, 'QR_CODE');
});

test('the code and the installed plugin agree on the API', () => {
  const pkg = JSON.parse(readFileSync('apps/mobile/node_modules/@capacitor/barcode-scanner/package.json', 'utf8'));
  const defs = readFileSync('apps/mobile/node_modules/@capacitor/barcode-scanner/dist/esm/definitions.d.ts', 'utf8');
  assert.match(defs, /scanBarcode\(options/);
  assert.ok(Number(pkg.version.split('.')[0]) >= 3, 'the Capacitor 8 line of the plugin');

  const code = read('app.js').replace(/\/\/.*$/gm, '');
  assert.match(code, /Plugins\.CapacitorBarcodeScanner/);
  assert.ok(!/Plugins\.BarcodeScanner\b/.test(code), 'no call to another plugin\'s API');
});

test('A GYM POSTER OPENS THAT GYM, OFFERING SIGN-IN AND JOINING', async () => {
  const { doc } = await scan('https://yoyogym.vercel.app/g/bos-gym');
  assert.ok(doc.getElementById('m-login'));
  assert.match(text(doc, '.m-join'), /New here\?/);
});

test('A MEMBER CARD FILLS IN THE NUMBER, AND SIGNS NOBODY IN', async () => {
  const { doc, calls } = await scan('https://yoyogym.vercel.app/g/bos-gym/p/m/GYM-2026-ABC123');
  assert.equal(doc.getElementById('m-mn').value, 'GYM-2026-ABC123');
  assert.ok(!calls.some((c) => c.path === '/api/member/login'));
});

test('a code that is not ours is said plainly, on the picker', async () => {
  const { doc } = await scan('https://evil.example/phish');
  assert.match(text(doc, '#note'), /not a Yoyo Gyms code/i);
});

test('backing out of the scanner is not an error', async () => {
  const { doc } = await scan(new Error('Scanning cancelled by the user'));
  assert.equal(text(doc, '#note'), '');
});

test('a refused camera leaves the app usable, and says where to change it', async () => {
  const { doc } = await scan(new Error('Camera permission denied'));
  assert.match(text(doc, '#note'), /allow it in your phone settings/);
});

test('in a browser, with no plugin, it says so rather than pretending', () => {
  const { doc, window } = boot();
  click(doc, window, '[data-go="member-signin"]');
  click(doc, window, '#scan');
  assert.match(text(doc, '#note'), /Scanning needs the Yoyo Gyms app/);
});

test('the old see-through overlay is gone — the plugin draws its own screen', () => {
  assert.ok(!/scan-panel/.test(read('index.html')));
});

// ---------------------------------------------------------------------------
// Behaving like an app
// ---------------------------------------------------------------------------

function nativeShell() {
  const log = { listeners: {}, minimized: 0, splashHidden: 0, style: null };
  const plugins = {
    App: {
      addListener: (name, fn) => { log.listeners[name] = fn; return Promise.resolve({ remove() {} }); },
      minimizeApp: async () => { log.minimized += 1; },
      exitApp: () => {},
    },
    StatusBar: { setStyle: async (o) => { log.style = o.style; }, setBackgroundColor: async () => {} },
    SplashScreen: { hide: async () => { log.splashHidden += 1; } },
  };
  return { log, plugins };
}

test('ANDROID BACK WALKS BACK THROUGH THE APP, THEN PUTS IT AWAY', () => {
  const { log, plugins } = nativeShell();
  const { doc, window } = boot({ plugins });
  const back = () => log.listeners.backButton();

  click(doc, window, '[data-go="member-signin"]');
  back();
  assert.ok(!doc.getElementById('home').classList.contains('hidden'), 'picker → home');

  window.YOYO_MEMBER.open('bos-gym', { name: 'BOS GYM' });
  back();
  assert.ok(doc.getElementById('member').classList.contains('hidden'), 'gym sign-in → out of the gym');

  back();
  assert.equal(log.minimized, 1, 'at home, the app is put away, not closed');
});

test('light status-bar text on the dark ground; the splash hides once drawn', () => {
  const { log, plugins } = nativeShell();
  boot({ plugins });
  assert.equal(log.style, 'DARK', 'Capacitor\'s DARK style means "for a dark background"');
  assert.equal(log.splashHidden, 1);
});

test('LEAVING FOR A WEB SCREEN WITH NO SIGNAL IS SAID, NOT A BROWSER ERROR PAGE', () => {
  const { doc, window } = boot();
  Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
  click(doc, window, '[data-go="owner-register"]');
  assert.match(text(doc, '#note'), /You are offline/);
});

test('the native plugins are declared, so a build includes them', () => {
  const pkg = JSON.parse(readFileSync('apps/mobile/package.json', 'utf8'));
  for (const p of ['@capacitor/app', '@capacitor/status-bar', '@capacitor/splash-screen', '@capacitor/haptics']) {
    assert.ok(pkg.dependencies[p], p);
  }
});

// ---------------------------------------------------------------------------
// iPhone
// ---------------------------------------------------------------------------

test('THE IPHONE APP EXPLAINS EVERY PERMISSION IT ASKS FOR', () => {
  // Without these strings iOS terminates the app the moment it asks.
  const plist = readFileSync('apps/mobile/ios/App/App/Info.plist', 'utf8');
  assert.match(plist, /<key>NSCameraUsageDescription<\/key>\s*<string>[^<]{20,}<\/string>/);
  assert.match(plist, /<key>NSLocationWhenInUseUsageDescription<\/key>\s*<string>[^<]{20,}<\/string>/);
  assert.ok(!/NSLocationAlways/.test(plist), 'never background location');
});

// ---------------------------------------------------------------------------
// Every script parses
// ---------------------------------------------------------------------------

test('EVERY SCRIPT THE APP LOADS IS VALID JAVASCRIPT', async () => {
  // An unescaped apostrophe in app.js once made the whole entry screen dead
  // on arrival. A syntax error stops a script entirely, so nothing else would
  // have caught it before a phone did.
  const { Script } = await import('node:vm');
  const html = read('index.html');
  const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
  assert.ok(scripts.length >= 5);
  for (const src of scripts) {
    assert.doesNotThrow(() => new Script(read(src), { filename: src }), src);
  }
});
