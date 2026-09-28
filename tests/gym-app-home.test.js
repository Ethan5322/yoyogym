// Each gym's own app (CLAUDE.md §38.1): a member reopens straight into THEIR
// gym's home — its cover, icon, notice, hours and contact — and someone new
// still sees the Yoyo Gyms front page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import { TextEncoder, TextDecoder } from 'node:util';

const WWW = 'apps/mobile/www/';
const read = (f) => readFileSync(WWW + f, 'utf8');
const tick = () => new Promise((r) => setTimeout(r, 30));
const text = (doc, sel) => doc.querySelector(sel)?.textContent?.trim() ?? null;
const visible = (doc, id) => !doc.getElementById(id).classList.contains('hidden');

const BRAND = {
  name: 'KOM',
  accent_color: '#E63946',
  cover_url: 'https://x.supabase.co/storage/v1/object/public/gym-branding/kom/cover-1.jpg',
  notice: 'Closed on Friday for the holiday.',
  operating_hours: 'Mon–Fri 05:00–21:00',
  phone: '+27 82 123 4567',
  email: 'hello@kom.co.za',
  address: '12 Main Rd, Durban',
};
const STATUS = {
  member: { full_name: 'Thandi Mokoena', membership_number: 'GYM-2026-000123', status: 'active' },
  membership: { plan_name: 'Monthly', end_date: '2026-12-31' },
  adherence: { visits_30d: 3, expected_30d: 12 },
  features: ['members', 'checkin'],
};

function boot({ url = 'https://localhost/', storage = {}, brand = BRAND } = {}) {
  const dom = new JSDOM(read('index.html').replace(/<script src="[^"]+"><\/script>/g, ''), {
    url, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole(),
  });
  const { window } = dom;
  window.TextEncoder = TextEncoder;
  window.TextDecoder = TextDecoder;
  for (const [k, v] of Object.entries(storage)) window.localStorage.setItem(k, v);
  window.fetch = async (u, init = {}) => {
    const path = String(u).replace('https://yoyogym.vercel.app', '').split('?')[0];
    const routes = {
      'GET /api/content': { status: 200, body: { branding: brand } },
      'GET /api/member/status': { status: 200, body: STATUS },
    };
    const r = routes[`${init.method || 'GET'} ${path}`] || { status: 404, body: {} };
    return { ok: r.status < 400, status: r.status, json: async () => r.body };
  };
  window.confirm = () => true;
  window.alert = () => {};
  for (const f of ['config.js', 'qr-payload.js', 'vendor-qrcode.js', 'member.js', 'app.js']) window.eval(read(f));
  return { window, doc: window.document };
}

const SIGNED_IN_AT_KOM = {
  'yoyo.lastrole': 'member',
  'yoyo.mygym': JSON.stringify({ slug: 'kom', name: 'KOM' }),
  'yoyo.member.token:kom': JSON.stringify('tok-kom'),
};

test('SOMEONE NEW SEES THE YOYO GYMS FRONT PAGE (Q8)', () => {
  const { doc } = boot();
  assert.ok(visible(doc, 'home'));
  assert.ok(doc.getElementById('member').classList.contains('hidden'));
});

test('A SIGNED-IN MEMBER REOPENS STRAIGHT INTO THEIR GYM (Q1)', async () => {
  const { doc } = boot({ storage: SIGNED_IN_AT_KOM });
  await tick();
  assert.ok(!doc.getElementById('member').classList.contains('hidden'), 'the member area, not the Yoyo front page');
  assert.ok(doc.body.classList.contains('in-member'));
  assert.match(text(doc, '.m-hello'), /Hi Thandi/);
});

test('THE GYM\'S HOME CARRIES ITS COVER, ICON, NOTICE, HOURS AND CONTACT (Q4)', async () => {
  const { doc } = boot({ storage: SIGNED_IN_AT_KOM });
  await tick();
  assert.equal(doc.querySelector('.m-gymhero__img').getAttribute('src'), BRAND.cover_url);
  assert.equal(text(doc, '.m-gymhero__id b'), 'KOM');
  assert.match(text(doc, '.m-notice'), /Closed on Friday/);
  assert.match(text(doc, '.m-contact'), /Mon–Fri 05:00–21:00/);
  assert.equal(doc.querySelector('.m-action[href^="tel:"]').getAttribute('href'), 'tel:+27821234567');
  assert.match(doc.querySelector('.m-action[href*="maps"]').getAttribute('href'), /query=12%20Main%20Rd%2C%20Durban/);
  assert.equal(doc.querySelector('.m-action[href^="mailto:"]').getAttribute('href'), 'mailto:hello@kom.co.za');
  assert.ok(doc.getElementById('member').classList.contains('m-on-home'), 'the hero replaces the small header on the home');
});

test('a gym with no cover, notice or contact shows just its icon and name', async () => {
  const { doc } = boot({ storage: SIGNED_IN_AT_KOM, brand: { name: 'KOM' } });
  await tick();
  assert.equal(doc.querySelector('.m-gymhero__img'), null);
  assert.equal(doc.querySelector('.m-notice'), null);
  assert.equal(doc.querySelector('.m-contact'), null);
  assert.equal(text(doc, '.m-gymhero__id .m-gymicon'), 'K', 'the gym\'s letter badge');
});

test('WHAT AN OWNER TYPES IS TEXT, AND A COVER IS ONLY EVER AN HTTPS PICTURE', async () => {
  const { doc } = boot({
    storage: SIGNED_IN_AT_KOM,
    brand: { name: 'KOM', notice: '<img src=x onerror=alert(1)>', cover_url: 'javascript:alert(1)', phone: '082"><b>', email: 'bad' },
  });
  await tick();
  assert.equal(doc.querySelector('.m-notice img'), null);
  assert.equal(doc.querySelector('.m-gymhero__img'), null, 'not a https URL: no cover at all');
  assert.equal(doc.querySelector('.m-action[href^="tel:"]').getAttribute('href'), 'tel:082');
  assert.equal(doc.querySelector('.m-action[href^="mailto:"]'), null);
});

test('a member without a session on this phone is not forced into the gym', () => {
  const { doc } = boot({ storage: { 'yoyo.lastrole': 'member', 'yoyo.mygym': JSON.stringify({ slug: 'kom', name: 'KOM' }) } });
  assert.ok(visible(doc, 'home'));
});

test('"← YOYO GYMS APP" FROM THE WEB SIGN-IN STAYS ON THE FRONT PAGE, AND NEXT TIME TOO', () => {
  const { doc, window } = boot({ url: 'https://localhost/?home=1', storage: SIGNED_IN_AT_KOM });
  assert.ok(visible(doc, 'home'));
  assert.equal(window.localStorage.getItem('yoyo.lastrole'), null);
});

test('SIGNING OUT PUTS THE PHONE BACK ON THE YOYO FRONT PAGE NEXT TIME', async () => {
  const { doc, window } = boot({ storage: SIGNED_IN_AT_KOM });
  await tick();
  doc.querySelector('[data-tab="profile"]').dispatchEvent(new window.Event('click', { bubbles: true }));
  doc.querySelector('[data-m="signout"]').dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal(window.localStorage.getItem('yoyo.lastrole'), null);
});

test('AN OWNER REOPENS INTO THEIR GYM\'S ADMIN PANEL, WITH THE WAY BACK (Q3)', () => {
  const app = read('app.js');
  assert.match(app, /else if \(role === 'owner'\) \{\s*var admin = myGym\(ADMIN_MINE\);\s*if \(admin\) goAdmin\(admin\.slug\);/);
  assert.match(app, /go\(adminPath\(slug\) \+ '\?app=1&back=' \+ encodeURIComponent\(appHome\(\)\)\)/);
});
