// The member's home, distilled (design critique 2026-09-29): a greeting, ONE
// banner, status and check-in together, the plans one tap away — and status
// said in words and icons, coloured by meaning, never in the gym's colour.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import { TextEncoder, TextDecoder } from 'node:util';
import { contrast } from '../shared/brand.js';

const WWW = 'apps/mobile/www/';
const read = (f) => readFileSync(WWW + f, 'utf8');
const tick = () => new Promise((r) => setTimeout(r, 20));
const text = (doc, sel) => doc.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;

const STATUS = {
  member: { full_name: 'Thandi Mokoena', membership_number: 'GYM-2026-ABC123', status: 'active', phone: '0821234567' },
  membership: { plan_name: 'Monthly Gold', end_date: '2026-12-31' },
  has_outstanding: false,
  adherence: { visits_30d: 9, expected_30d: 12, label: 'On track' },
  features: ['members', 'checkin', 'classes'],
};

function boot({ status = STATUS, branding = { name: 'BOS GYM', accent_color: '#E63946' }, catalog = null } = {}) {
  const dom = new JSDOM(read('index.html').replace(/<script src="[^"]+"><\/script>/g, ''), {
    url: 'https://localhost/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
  });
  const { window } = dom;
  window.TextEncoder = TextEncoder;
  window.TextDecoder = TextDecoder;
  window.alert = () => {};
  window.confirm = () => true;
  const routes = {
    'GET /api/content': { branding, offer: { services: [{ text: 'Book classes' }], facilities: ['Showers'] } },
    'GET /api/catalog': catalog || { plans: [{ id: 'p1', name: 'Monthly', monthly_price: 300 }], addons: [] },
    'POST /api/member/login': { token: 'tok', member: status.member },
    'GET /api/member/status': status,
  };
  window.fetch = async (url, init = {}) => {
    const path = String(url).replace('https://yoyogym.vercel.app', '').split('?')[0];
    const body = routes[`${init.method || 'GET'} ${path}`];
    return { ok: Boolean(body), status: body ? 200 : 404, json: async () => body || {} };
  };
  for (const f of ['config.js', 'qr-payload.js', 'vendor-qrcode.js', 'member.js', 'app.js']) window.eval(read(f));
  return { window, doc: window.document };
}

async function signedIn(opts) {
  const app = boot(opts);
  app.window.YOYO_MEMBER.open('bos-gym', { name: 'BOS GYM' });
  await tick();
  app.doc.getElementById('m-mn').value = 'GYM-2026-ABC123';
  app.doc.getElementById('m-ph').value = '0821234567';
  app.doc.getElementById('m-login').dispatchEvent(new app.window.Event('submit', { cancelable: true }));
  await tick();
  return app;
}

const click = (app, sel) => app.doc.querySelector(sel).dispatchEvent(new app.window.MouseEvent('click', { bubbles: true }));

test('the home is headed by a greeting, not the plan\'s name', async () => {
  const { doc } = await signedIn();
  assert.equal(text(doc, '#m-main h1'), 'Hi Thandi');
  assert.match(text(doc, '.m-hello .m-sub'), /Monthly Gold · until/);
});

test('status and check-in are one card, and it comes before everything that is not the gym', async () => {
  const { doc } = await signedIn();
  const card = doc.querySelector('.m-checkcard');
  assert.ok(card.contains(doc.getElementById('m-checkin')));
  assert.match(text(doc, '.m-checkcard .m-state'), /Active/);
  const order = [...doc.querySelectorAll('#m-main > *')];
  const at = (cls) => order.findIndex((el) => el.classList.contains(cls));
  assert.ok(at('m-checkcard') > -1 && at('m-checkcard') < at('m-list') && at('m-checkcard') < at('m-progress'));
});

test('status is said in words AND an icon, coloured by meaning', async () => {
  for (const [st, tone] of [['active', 'is-good'], ['new', 'is-warn'], ['frozen', 'is-warn'], ['lapsed', 'is-bad'], ['suspended', 'is-bad']]) {
    const { doc } = await signedIn({ status: { ...STATUS, member: { ...STATUS.member, status: st } } });
    const state = doc.querySelector('.m-state');
    assert.ok(state.classList.contains(tone), `${st} → ${tone}`);
    assert.ok(state.querySelector('svg.m-i'), `${st} has an icon`);
    assert.ok(state.textContent.trim().length > 3, `${st} has words`);
  }
});

test('a red gym\'s colour is never the colour of a problem', () => {
  const css = read('index.html');
  for (const rule of ['.m-state.is-bad', '.m-banner.is-warn .m-i', '.m-err', '.m-danger']) {
    const at = css.indexOf(rule);
    assert.ok(at > -1, rule);
    const body = css.slice(at, css.indexOf('}', at));
    assert.doesNotMatch(body, /--m-accent/, `${rule} does not use the gym colour`);
  }
});

test('at most ONE banner: payment due wins, and the notice still reaches the member', async () => {
  const { doc } = await signedIn({
    status: { ...STATUS, has_outstanding: true },
    branding: { name: 'BOS GYM', notice: 'Closed on Friday' },
  });
  assert.equal(doc.querySelectorAll('.m-banner').length, 1);
  assert.match(text(doc, '.m-banner'), /Payment due/);
  assert.ok(doc.querySelector('.m-banner.is-warn svg.m-i'), 'amber AND an icon');
  assert.match(text(doc, '.m-contact'), /Closed on Friday/);
});

test('the plans, add-ons and facilities are one tap away, and back again', async () => {
  const app = await signedIn();
  assert.equal(app.doc.querySelector('#m-main .m-offer'), null, 'not on the home itself');
  click(app, '[data-m="offer"]');
  assert.match(text(app.doc, '.m-offer h1'), /What BOS GYM offers/);
  assert.match(text(app.doc, '.m-offer'), /Monthly/);
  assert.match(app.doc.title, /^Plans and facilities/);
  click(app, '[data-m="offer-back"]');
  assert.equal(text(app.doc, '#m-main h1'), 'Hi Thandi');
});

test('Android back leaves the plans first, then the home', async () => {
  const app = await signedIn();
  click(app, '[data-m="offer"]');
  assert.equal(app.window.YOYO_MEMBER.back(), true);
  assert.equal(text(app.doc, '#m-main h1'), 'Hi Thandi');
});

test('one back button in the whole app: the Yoyo one', async () => {
  const app = boot();
  app.window.YOYO_MEMBER.open('bos-gym', { name: 'BOS GYM' });
  await tick();
  assert.equal(app.doc.querySelector('.m-back'), null);
  assert.ok(app.doc.querySelector('.m-signin .y-back[data-m="leave"] svg'));
});

test('on the sign-in, "Scan my membership card" comes BEFORE the fields it fills', async () => {
  const app = boot();
  app.window.YOYO_MEMBER.open('bos-gym', { name: 'BOS GYM' });
  await tick();
  const scan = app.doc.querySelector('[data-m="scan-card"]');
  const number = app.doc.getElementById('m-mn');
  assert.ok(scan.compareDocumentPosition(number) & app.window.Node.DOCUMENT_POSITION_FOLLOWING);
  assert.equal(text(app.doc, '.m-hero h1'), 'Sign in to BOS GYM');
});

test('the gym\'s colour as words on the dark ground always reads', async () => {
  const { doc } = await signedIn({ branding: { name: 'Dark', accent_color: '#1A1A40' } });
  const words = doc.getElementById('member').style.getPropertyValue('--m-accent-text');
  assert.ok(contrast(words, '#2A3236') >= 4.5, words);
});

test('no coloured halo under the check-in', () => {
  const css = read('index.html');
  const at = css.indexOf('.m-checkin {');
  assert.doesNotMatch(css.slice(at, css.indexOf('}', at)), /box-shadow:[^;]*(color-mix|--m-accent)/);
  assert.doesNotMatch(css, /\.m-checkin\.is-done \{[^}]*box-shadow/);
});
