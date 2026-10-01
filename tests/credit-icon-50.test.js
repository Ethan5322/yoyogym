// CLAUDE.md §50: the app icon is the mark alone, and "Designed and built by
// MuleSoo Digital Services" closes every page — the website, both admin
// panels, the chatbot and the app — in the page's own flow, never over a word,
// the chat or a button.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import { TextEncoder, TextDecoder } from 'node:util';

process.env.PLATFORM_JWT_SECRET ||= 'test-only-signing-key-not-used-anywhere';

const { CREDIT } = await import('../shared/brand.js');
const views = await import('../platform/views.js');

const read = (f) => readFileSync(f, 'utf8');
const count = (html) => (html.match(/Designed and built by MuleSoo Digital Services/g) || []).length;

test('the words, once, exactly as asked', () => {
  assert.equal(CREDIT, 'Designed and built by MuleSoo Digital Services');
});

// ---------------------------------------------------------------------------
// The website
// ---------------------------------------------------------------------------

test('every website page and both sign-ins end with the credit', () => {
  for (const f of [
    'src/components/AdminShell.jsx', // every page of the gym admin panel
    'src/chatbot/ChatWindow.jsx', // the chatbot
    'src/pages/Register.jsx',
    'src/pages/Splash.jsx',
    'src/pages/MemberPortal.jsx',
    'src/pages/admin/Login.jsx',
    'src/pages/OwnerLogin.jsx',
    'src/pages/PublicProfile.jsx',
    'src/pages/NotFound.jsx',
    'src/components/GymUnavailable.jsx',
  ]) {
    assert.match(read(f), /<Credit \/>/, f);
  }
  assert.match(read('src/components/Credit.jsx'), /import \{ CREDIT \} from '..\/..\/shared\/brand.js'/);
});

test('in the chatbot the credit is its own last row, under the answer box — never over the chat', () => {
  const chat = read('src/chatbot/ChatWindow.jsx');
  const footer = chat.indexOf('className="chat-footer');
  const credit = chat.indexOf('<Credit />');
  assert.ok(footer > 0 && credit > footer, 'after the answer box');
  assert.match(chat.slice(credit), /<Credit \/>\s*<\/div>\s*\);/, 'the last child of the chat window');
  assert.doesNotMatch(read('src/index.css'), /\.site-credit \{[^}]*position:\s*(fixed|absolute)/, 'in the flow, never laid over');
});

test('in the gym admin panel the credit follows the page, outside the content column', () => {
  assert.match(read('src/components/AdminShell.jsx'), /<main className="[^"]*flex-1[^"]*">\{children\}<\/main>\s*<Credit \/>/);
});

// ---------------------------------------------------------------------------
// The main admin panel and the owner's pages
// ---------------------------------------------------------------------------

test('every platform page carries it once: sign-in, panel, owner page, public page', () => {
  const staff = { id: 's1', email: 'staff@yoyo.co', kind: 'platform_staff' };
  assert.equal(count(views.loginPage({})), 1);
  assert.equal(count(views.layout({ user: staff, body: '<h1>Today</h1>' })), 1);
  assert.equal(count(views.ownerDashboardPage({ user: { email: 'a@b.co' } })), 1);
  assert.equal(count(views.welcomePage({ plans: [], includes: [] })), 1);
  assert.equal(count(views.problemPage({ title: 'x', message: 'y' })), 1);
});

test('on the panel it is the last thing in the content; on a sign-in, its own row under the card', () => {
  const panel = views.layout({ user: { id: 's1', email: 's@y.co', kind: 'platform_staff' }, body: '<h1>Gyms</h1>' });
  assert.match(panel, /<h1>Gyms<\/h1>\s*<p class="credit">[^<]+<\/p>\s*<\/main>/);
  const login = views.loginPage({});
  assert.match(login, /<\/main>\s*<p class="credit">[^<]+<\/p>\s*<\/body>/);
  assert.match(login, /body\.auth \{ grid-template-rows:1fr auto; \}/);
});

// ---------------------------------------------------------------------------
// The app
// ---------------------------------------------------------------------------

test('every Yoyo screen of the app ends with the credit, and the landing has it under Privacy · Help', () => {
  const dom = new JSDOM(read('apps/mobile/www/index.html'));
  const doc = dom.window.document;
  const screens = [...doc.querySelectorAll('section.y-screen')];
  assert.equal(screens.length, 8);
  for (const s of screens) assert.equal(s.lastElementChild.className, 'y-credit', s.id);
  const landing = doc.querySelector('#home .y-landing__body');
  assert.equal(landing.lastElementChild.className, 'y-credit');
  assert.equal(landing.lastElementChild.previousElementSibling.classList.contains('y-foot'), true);
  // Buttons already pushed to the thumb zone keep their place: the credit follows them.
  assert.match(read('apps/mobile/www/index.html'), /\.y-bottom ~ \.y-credit, \.g-id ~ \.y-credit \{ margin-top: 0;/);
});

function bootMember() {
  const www = (f) => read('apps/mobile/www/' + f);
  const dom = new JSDOM(www('index.html').replace(/<script src="[^"]+"><\/script>/g, ''), {
    url: 'https://localhost/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole(),
  });
  const { window } = dom;
  window.TextEncoder = TextEncoder;
  window.TextDecoder = TextDecoder;
  window.fetch = async (url) => {
    const path = String(url).replace('https://yoyogym.vercel.app', '').split('?')[0];
    const body = path === '/api/member/status'
      ? { member: { full_name: 'Thandi Mokoena', status: 'active', membership_number: 'GYM-1' }, membership: {}, features: ['members'] }
      : path === '/api/content' ? { branding: { name: 'KOM' } } : {};
    return { ok: true, status: 200, json: async () => body };
  };
  for (const f of ['config.js', 'qr-payload.js', 'vendor-qrcode.js', 'member.js', 'app.js']) window.eval(www(f));
  return window;
}

test('in the member area the credit sits between the content and the tab bar, holding the tabs\' space', async () => {
  const window = bootMember();
  window.localStorage.setItem('yoyo.member.token:kom', JSON.stringify('tok'));
  window.YOYO_MEMBER.open('kom', { name: 'KOM' });
  await new Promise((r) => setTimeout(r, 40));
  const main = window.document.querySelector('#member .m-main');
  assert.equal(main.nextElementSibling.className, 'm-credit');
  assert.equal(main.nextElementSibling.nextElementSibling.className, 'm-tabs');
  const css = read('apps/mobile/www/index.html');
  assert.match(css, /\.m-credit \{\s*margin: 0; padding: 8px 24px calc\(96px \+ env\(safe-area-inset-bottom\)\);/);
  assert.match(css, /\.m-main \{ flex: 1; padding: 0 24px 16px; \}/);
});

test('on the member sign-in the credit closes the screen', async () => {
  const window = bootMember();
  window.YOYO_MEMBER.open('kom', { name: 'KOM' });
  await new Promise((r) => setTimeout(r, 40));
  const last = window.document.getElementById('member').lastElementChild;
  assert.equal(last.className, 'm-credit m-credit--end');
  assert.equal(last.textContent, CREDIT);
});

// ---------------------------------------------------------------------------
// The icon
// ---------------------------------------------------------------------------

test('the app icon is the MARK — no "YOYO GYMS", no "LIFT • TRAIN • TRANSFORM"; the splash keeps the whole logo', () => {
  const script = read('scripts/mobile/make-icon-sources.mjs');
  assert.match(script, /compose\(1024, 0\.72, GROUND, MARK\)\)\.toFile\(join\(out, 'icon-only\.png'\)\)/);
  assert.match(script, /compose\(1024, 0\.5, null, MARK\)\)\.toFile\(join\(out, 'icon-foreground\.png'\)\)/);
  assert.match(script, /compose\(2732, 0\.34, GROUND\)\)\.toFile\(join\(out, 'splash\.png'\)\)/);
  assert.match(read('apps/mobile/android/app/build.gradle'), /versionCode 2\s+versionName "1\.0\.1"/);
});
