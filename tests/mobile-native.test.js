// The app behaving like an app: the QR scanner, Android's back button, the
// status bar and splash, no-signal handling, and the iPhone permission strings.
//
// THE SCANNER NEVER WORKED IN A BUILT APP. The code called another plugin's
// API (BarcodeScanner.checkPermissions / scan) while the installed one is
// CapacitorBarcodeScanner.scanBarcode(). These tests drive the installed API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
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
  click(app.doc, app.window, '[data-go="member"]');
  click(app.doc, app.window, '#scan');
  await tick();
  return { ...app, scanCalls };
}

/** The message line on the member's "Welcome, Member" screen, where Scan lives. */
const WELCOME_NOTE = '#member-welcome [data-note]';

test('THE SCANNER CALLS THE PLUGIN THAT IS INSTALLED, FOR QR CODES', async () => {
  const { scanCalls } = await scan('https://yoyogym.vercel.app/g/bos-gym');
  assert.equal(scanCalls.length, 1, 'the plugin was found and called');
  assert.equal(scanCalls[0].hint, 0, 'QR_CODE');
});

test('the code and the installed plugin agree on the API', (t) => {
  // The VERSION comes from the committed lock file, so this runs everywhere —
  // including CI, which installs only the root project and has no
  // apps/mobile/node_modules. (Reading node_modules here failed CI once.)
  const lock = JSON.parse(readFileSync('apps/mobile/package-lock.json', 'utf8'));
  const locked = lock.packages?.['node_modules/@capacitor/barcode-scanner']?.version;
  assert.ok(locked, 'the scanner plugin is in the mobile lock file');
  assert.ok(Number(locked.split('.')[0]) >= 3, `the Capacitor 8 line of the plugin (locked: ${locked})`);

  const code = read('app.js').replace(/\/\/.*$/gm, '');
  assert.match(code, /Plugins\.CapacitorBarcodeScanner/);
  assert.ok(!/Plugins\.BarcodeScanner\b/.test(code), 'no call to another plugin\'s API');

  // The plugin's OWN type definitions, where they are installed: the check
  // that would have caught the scanner calling another plugin's API.
  const defsPath = 'apps/mobile/node_modules/@capacitor/barcode-scanner/dist/esm/definitions.d.ts';
  if (!existsSync(defsPath)) {
    t.diagnostic('apps/mobile is not installed here; the API check against the plugin\'s own definitions ran where it is.');
    return;
  }
  assert.match(readFileSync(defsPath, 'utf8'), /scanBarcode\(options/);
});

test('A GYM POSTER OPENS THAT GYM, OFFERING SIGN-IN AND JOINING', async () => {
  // "Welcome to [Gym]" — CLAUDE.md §36.
  const { doc } = await scan('https://yoyogym.vercel.app/g/bos-gym');
  assert.ok(!doc.getElementById('gym').classList.contains('hidden'));
  assert.equal(text(doc, '#gym [data-gym-name]'), 'Bos Gym');
  assert.ok(doc.querySelector('#gym [data-go="join"]'), 'New member registration');
  assert.ok(doc.querySelector('#gym [data-go="signin"]'), 'Existing member login');
});

test('A MEMBER CARD FILLS IN THE NUMBER, AND SIGNS NOBODY IN', async () => {
  const { doc, calls } = await scan('https://yoyogym.vercel.app/g/bos-gym/p/m/GYM-2026-ABC123');
  assert.equal(doc.getElementById('m-mn').value, 'GYM-2026-ABC123');
  assert.ok(!calls.some((c) => c.path === '/api/member/login'));
});

test('a code that is not ours is said plainly, where the scan was started', async () => {
  const { doc } = await scan('https://evil.example/phish');
  assert.match(text(doc, WELCOME_NOTE), /not a Yoyo Gyms code/i);
});

test('backing out of the scanner is not an error', async () => {
  const { doc } = await scan(new Error('Scanning cancelled by the user'));
  assert.equal(text(doc, WELCOME_NOTE), '');
});

test('a refused camera leaves the app usable, and says where to change it', async () => {
  const { doc } = await scan(new Error('Camera permission denied'));
  assert.match(text(doc, WELCOME_NOTE), /allow it in your phone settings/);
});

test('in a browser, with no plugin, it says so rather than pretending', async () => {
  const { doc, window } = boot();
  click(doc, window, '[data-go="member"]');
  click(doc, window, '#scan');
  await tick();
  assert.match(text(doc, WELCOME_NOTE), /Scanning needs the Yoyo Gyms app/);
});

test('a gym-less code of ours opens the gym search, with the reason', async () => {
  const { doc } = await scan('https://yoyogym.vercel.app/register?src=qr');
  assert.ok(!doc.getElementById('pick').classList.contains('hidden'));
  assert.notEqual(text(doc, '#note'), '');
});

// ---------------------------------------------------------------------------
// "Scan my membership card", on a gym's sign-in screen (§36.1 Q6)
// ---------------------------------------------------------------------------

async function scanCard(outcome) {
  const plugins = {
    CapacitorBarcodeScanner: { scanBarcode: async () => ({ ScanResult: outcome, format: 0 }) },
  };
  const app = boot({ plugins });
  app.window.YOYO_MEMBER.open('bos-gym', { name: 'BOS GYM' });
  click(app.doc, app.window, '[data-m="scan-card"]');
  await tick();
  return app;
}

test('THE MEMBERSHIP CARD FILLS IN THE NUMBER ONLY — NOBODY IS SIGNED IN', async () => {
  const { doc, calls } = await scanCard('https://yoyogym.vercel.app/g/bos-gym/p/m/GYM-2026-ABC123');
  assert.equal(doc.getElementById('m-mn').value, 'GYM-2026-ABC123');
  assert.equal(doc.getElementById('m-ph').value, '', 'the phone is still the member\'s to type');
  assert.ok(!calls.some((c) => c.path === '/api/member/login'));
});

test('the gym\'s own poster is not a membership card, and says so', async () => {
  const { doc } = await scanCard('https://yoyogym.vercel.app/g/bos-gym');
  assert.match(text(doc, '#m-scan-err'), /membership card/);
  assert.equal(doc.getElementById('m-mn').value, '');
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

  click(doc, window, '[data-go="member"]');
  click(doc, window, '[data-go="find"]');
  back();
  assert.ok(!doc.getElementById('member-welcome').classList.contains('hidden'), 'search → Welcome, Member');
  back();
  assert.ok(!doc.getElementById('home').classList.contains('hidden'), 'Welcome, Member → home');

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
  click(doc, window, '[data-go="owner"]');
  click(doc, window, '#owner-welcome [data-go="owner-apply"]');
  click(doc, window, '#owner-apply [data-go="owner-register"]');
  assert.match(text(doc, '#owner-apply [data-note]'), /You are offline/);
});

// ---------------------------------------------------------------------------
// The first screen and the paths from it (CLAUDE.md §36, §36.1)
// ---------------------------------------------------------------------------

const visible = (doc, id) => !doc.getElementById(id).classList.contains('hidden');

test('THE FIRST SCREEN: THE PHOTO, THE HEADLINE, TWO CHOICES, PRIVACY AND HELP', () => {
  const { doc } = boot();
  assert.ok(visible(doc, 'home'));
  assert.match(text(doc, '.y-headline'), /Your gym\.\s*Your journey\./i);
  assert.match(text(doc, '.y-lede'), /Connect to your gym, manage your membership, and stay committed to your goals\./);

  const choices = [...doc.querySelectorAll('#home .y-actions button')].map((b) => b.textContent.trim().toUpperCase());
  assert.deepEqual(choices, ['I’M A MEMBER', 'I’M A GYM OWNER'], 'exactly two, in this order');
  assert.ok(doc.querySelector('#home .y-btn--primary[data-go="member"]'), 'the member button is the bright one');

  const foot = [...doc.querySelectorAll('#home .y-foot button')].map((b) => b.textContent.trim());
  assert.deepEqual(foot, ['Privacy', 'Help']);
});

test('THE PHOTOGRAPH CARRIES THE LOGO — NO SECOND LOGO IS PUT OVER IT', () => {
  // §36.1 Q11: the user's image already has the Yoyo Gyms logo on it.
  const { doc } = boot();
  const hero = doc.querySelector('#home .y-hero');
  assert.equal(hero.querySelectorAll('img').length, 1);
  assert.equal(hero.textContent.trim(), '', 'no wordmark text over the photo');
  assert.equal(doc.querySelectorAll('#home img').length, 1, 'and no other logo on the first screen');
  assert.ok(existsSync(WWW + hero.querySelector('img').getAttribute('src')), 'the photo ships inside the app');
  assert.ok(existsSync(WWW + 'img/logo-on-dark.png'));
});

test('THE MAIN YOYO ADMIN PANEL IS NOT IN THE APP', () => {
  // §36.1 Q2: website only. Owner login is the gym's own admin sign-in.
  const html = read('index.html');
  const app = read('app.js');
  assert.ok(!/Main Admin|Platform administrator/i.test(html));
  for (const panel of ['/platform/home', '/platform/applications', '/platform/registry']) {
    assert.ok(!app.includes(panel) && !html.includes(panel), panel);
  }
});

test('WELCOME, MEMBER: FIND AND SCAN — AND "I ALREADY KNOW MY GYM" ONLY WHEN ONE IS SAVED', () => {
  const fresh = boot();
  click(fresh.doc, fresh.window, '[data-go="member"]');
  assert.match(text(fresh.doc, '#member-welcome .y-title'), /Welcome, Member/);
  assert.ok(fresh.doc.querySelector('#member-welcome [data-go="find"]'));
  assert.ok(fresh.doc.querySelector('#member-welcome #scan'));
  assert.ok(!visible(fresh.doc, 'mine'), 'nothing saved, nothing offered');

  const saved = boot();
  saved.window.localStorage.setItem('yoyo.mygym', JSON.stringify({ slug: 'bos-gym', name: 'BOS GYM' }));
  click(saved.doc, saved.window, '[data-go="member"]');
  assert.ok(visible(saved.doc, 'mine'));
  assert.equal(text(saved.doc, '#mine-name'), 'BOS GYM');

  click(saved.doc, saved.window, '#mine-open');
  assert.ok(visible(saved.doc, 'gym'), 'Welcome to [Gym]');
  assert.equal(text(saved.doc, '#gym [data-gym-name]'), 'BOS GYM');
});

test('a member already signed in to that gym goes straight in', async () => {
  const { doc, window } = boot();
  window.localStorage.setItem('yoyo.mygym', JSON.stringify({ slug: 'bos-gym', name: 'BOS GYM' }));
  window.localStorage.setItem('yoyo.member.token:bos-gym', JSON.stringify('tok'));
  click(doc, window, '[data-go="member"]');
  click(doc, window, '#mine-open');
  assert.ok(!doc.getElementById('member').classList.contains('hidden'), 'the member area');
  assert.ok(!doc.getElementById('m-login'), 'not the sign-in form');
});

test('WELCOME TO [GYM]: JOIN LEADS TO "JOIN [GYM]", SIGN IN TO "SIGN IN TO [GYM]"', () => {
  const { doc, window } = boot();
  window.localStorage.setItem('yoyo.mygym', JSON.stringify({ slug: 'bos-gym', name: 'BOS GYM' }));
  click(doc, window, '[data-go="member"]');
  click(doc, window, '#mine-open');

  click(doc, window, '#gym [data-go="join"]');
  assert.ok(visible(doc, 'join'));
  assert.equal(text(doc, '#join .y-title'), 'Join BOS GYM');
  assert.ok(doc.querySelector('#join [data-go="register"]'), 'Start registration');

  click(doc, window, '#join [data-go="signin"]');
  assert.ok(doc.getElementById('m-login'), 'Sign in instead');
  assert.equal(text(doc, '.m-hero h1').replace(/\s+/g, ' '), 'Sign in to BOS GYM');
  assert.ok(doc.querySelector('[data-m="scan-card"]'), 'Scan my membership card');
  assert.ok(doc.querySelector('[data-m="help"]'), 'Need help?');

  // Back from the gym's sign-in returns to the Yoyo screen it came from.
  click(doc, window, '[data-m="leave"]');
  assert.ok(visible(doc, 'join'));
});

test('OWNER LOGIN IS EMAIL + PASSWORD ALONE — no choosing the gym (CLAUDE.md §43.1 Q2)', () => {
  const { doc, window } = boot();
  click(doc, window, '[data-go="owner"]');
  assert.match(text(doc, '#owner-welcome .y-title'), /Welcome, Gym Owner/);
  const options = [...doc.querySelectorAll('#owner-welcome .y-option b')].map((b) => b.textContent);
  assert.deepEqual(options, ['Apply to join Yoyo Gyms', 'Owner login', 'Gym staff sign in', 'Check application status']);
  assert.match(text(doc, '#owner-welcome [data-go="owner-signin"] small'), /email you applied with/);

  click(doc, window, '[data-go="owner-signin"]');
  // Off to the website's email sign-in (where the admin panel keeps its
  // session); remembered, so reopening the app goes back there.
  assert.equal(window.localStorage.getItem('yoyo.lastrole'), 'owner-email');
  assert.ok(!visible(doc, 'pick'), 'no gym search for an owner');
});

test('GYM STAFF STILL CHOOSE THEIR GYM, THEN ITS OWN ADMIN SIGN-IN', async () => {
  const routes = {
    ...ROUTES,
    'GET /platform/api/gyms': { status: 200, body: { gyms: [{ slug: 'bos-gym', name: 'BOS GYM', city: 'Durban' }] } },
  };
  const { doc, window } = boot({ routes });
  click(doc, window, '[data-go="owner"]');
  click(doc, window, '[data-go="staff-signin"]');
  assert.equal(text(doc, '#pick-title'), 'Gym owner login');
  assert.match(text(doc, '#pick-sub'), /staff/);
  assert.ok(!visible(doc, 'forgot'), 'the member recovery route is not offered to owners');
  assert.ok(visible(doc, 'owner-extras'), 'Forgot password? and Apply');

  const q = doc.getElementById('q');
  q.value = 'bos';
  q.dispatchEvent(new window.Event('input'));
  await new Promise((r) => setTimeout(r, 320));
  click(doc, window, '#results .gym');
  assert.deepEqual(JSON.parse(window.localStorage.getItem('yoyo.admingym')), { slug: 'bos-gym', name: 'BOS GYM' });
  assert.equal(window.localStorage.getItem('yoyo.mygym'), null, 'an owner\'s gym is not saved as a member\'s');
});

test('HELP: SUPPORT, QUESTIONS, PRIVACY, DELETE YOUR ACCOUNT — AND STAFF ONLY LEAVE THE APP', () => {
  const { doc, window } = boot();
  click(doc, window, '#home [data-go="help"]');
  assert.ok(visible(doc, 'help'));
  assert.equal(text(doc, '#support-email'), 'hello@mulesoo.com');
  assert.equal(doc.getElementById('support-link').getAttribute('href'), 'mailto:hello@mulesoo.com');
  assert.ok(doc.querySelectorAll('#help details').length >= 3, 'common questions');
  assert.ok(doc.querySelector('#help [data-go="privacy"]'));
  assert.ok(doc.querySelector('#help [data-go="delete-account"]'), 'the stores require it (§36.1 Q1)');

  // No admin host yet, so no link at all: a tap would open the staff panel
  // INSIDE the app, on the shared host.
  assert.equal(doc.querySelector('#staff a'), null);
  assert.match(text(doc, '#staff'), /staff/i);
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

// ---------------------------------------------------------------------------
// Hardened after the design critique (2026-09-29)
// ---------------------------------------------------------------------------

test('A SCREEN CHANGE MOVES FOCUS TO ITS HEADING AND NAMES THE PAGE', () => {
  const { doc, window } = boot();
  click(doc, window, '[data-go="member"]');
  assert.equal(doc.activeElement.tagName, 'H1', 'a screen reader follows the member to the new screen');
  assert.equal(doc.activeElement.textContent, 'Welcome, Member');
  assert.equal(doc.title, 'Welcome, Member · Yoyo Gyms');
  click(doc, window, '[data-go="back"]');
  assert.match(doc.title, /Yoyo Gyms/);
});

test('a gym search that takes a moment says "Searching…" instead of showing nothing', async () => {
  let release;
  const slow = new Promise((r) => { release = r; });
  const { doc, window } = boot();
  window.fetch = async () => { await slow; return { ok: true, status: 200, json: async () => ({ gyms: [] }) }; };
  click(doc, window, '[data-go="member"]');
  click(doc, window, '[data-go="find"]');
  const q = doc.getElementById('q');
  q.value = 'coc';
  q.dispatchEvent(new window.Event('input'));
  await new Promise((r) => setTimeout(r, 700));
  assert.match(doc.getElementById('results').textContent, /Searching…/);
  release();
});
