// The gym's own look from the moment it is chosen (design critique 2026-09-29):
// search results in each gym's mark, "Welcome to [Gym]" in its colour, cover
// and poster, the saved gym first — and nothing of a gym on the Yoyo screens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import { TextEncoder, TextDecoder } from 'node:util';
import { accentPair } from '../shared/brand.js';

const WWW = 'apps/mobile/www/';
const read = (f) => readFileSync(WWW + f, 'utf8');
const tick = () => new Promise((r) => setTimeout(r, 20));
const click = (doc, window, sel) => doc.querySelector(sel).dispatchEvent(new window.Event('click', { bubbles: true }));

const BRANDS = {
  'bos-gym': { name: 'BOS GYM', accent_color: '#E63946', poster_url: 'https://cdn.example/bos/poster.jpg', cover_url: 'https://cdn.example/bos/cover.jpg' },
  'cocate-gym': { name: 'COCATE GYM', logo_url: 'https://cdn.example/cocate/logo.png' },
};
const GYMS = [
  { slug: 'bos-gym', name: 'BOS GYM', city: 'Durban' },
  { slug: 'cocate-gym', name: 'COCATE GYM', city: 'Addis Ababa' },
];

function boot({ content = 'ok', storage = null } = {}) {
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
  window.alert = () => {};
  if (storage) for (const [k, v] of Object.entries(storage)) window.localStorage.setItem(k, v);
  window.fetch = async (url, init = {}) => {
    const path = String(url).replace('https://yoyogym.vercel.app', '').split('?')[0];
    const slug = (init.headers || {})['X-Gym-Slug'] || null;
    calls.push({ method: init.method || 'GET', path, slug });
    let r = { status: 404, body: {} };
    if (path === '/platform/api/gyms') r = { status: 200, body: { gyms: GYMS } };
    if (path === '/api/content') {
      r = content === 'ok' ? { status: 200, body: { branding: BRANDS[slug] || null } } : { status: 500, body: {} };
    }
    return { ok: r.status < 400, status: r.status, json: async () => r.body };
  };
  for (const f of ['config.js', 'qr-payload.js', 'vendor-qrcode.js', 'member.js', 'app.js']) window.eval(read(f));
  return { window, doc: window.document, calls };
}

async function searchFor(doc, window, term) {
  click(doc, window, '[data-go="member"]');
  click(doc, window, '[data-go="find"]');
  const q = doc.getElementById('q');
  q.value = term;
  q.dispatchEvent(new window.Event('input'));
  await new Promise((r) => setTimeout(r, 340));
  await tick();
}

test('each search result wears its OWN gym mark: its colour, or its logo — never the Yoyo lime', async () => {
  const { doc, window, calls } = boot();
  await searchFor(doc, window, 'gym');

  const bos = doc.querySelector('#results .gym[data-slug="bos-gym"] .g-mark');
  assert.ok(bos.classList.contains('is-known'));
  assert.equal(bos.style.getPropertyValue('--g-accent'), accentPair('#E63946').accent);
  assert.equal(bos.style.getPropertyValue('--g-accent-ink'), accentPair('#E63946').ink);
  assert.equal(bos.textContent, 'B');

  const cocate = doc.querySelector('#results .gym[data-slug="cocate-gym"] .g-mark');
  assert.ok(cocate.classList.contains('has-logo'));
  assert.equal(cocate.querySelector('img').getAttribute('src'), 'https://cdn.example/cocate/logo.png');

  // Asked of each gym by name, exactly as the member area asks.
  const asked = calls.filter((c) => c.path === '/api/content').map((c) => c.slug).sort();
  assert.deepEqual(asked, ['bos-gym', 'cocate-gym']);
});

test('the look is kept where the member area reads it, so a member who signs in next has it offline', async () => {
  const { doc, window } = boot();
  await searchFor(doc, window, 'gym');
  assert.deepEqual(JSON.parse(window.localStorage.getItem('yoyo.member.brand:bos-gym')), BRANDS['bos-gym']);
});

test('a gym that cannot be reached keeps its plain letter, promising no colour', async () => {
  const { doc, window } = boot({ content: 'down' });
  await searchFor(doc, window, 'gym');
  const bos = doc.querySelector('#results .gym[data-slug="bos-gym"] .g-mark');
  assert.equal(bos.textContent, 'B');
  assert.ok(!bos.classList.contains('is-known'));
  assert.equal(bos.style.getPropertyValue('--g-accent'), '');
});

test('"Welcome to [Gym]" wears the gym: its colour, poster and cover — and the next gym starts clean', async () => {
  const { doc, window } = boot();
  await searchFor(doc, window, 'gym');
  click(doc, window, '#results .gym[data-slug="bos-gym"]');
  await tick();

  const gym = doc.getElementById('gym');
  assert.ok(!gym.classList.contains('hidden'));
  assert.equal(gym.querySelector('h1').textContent.replace(/\s+/g, ' ').trim(), 'Welcome to BOS GYM');
  assert.equal(gym.style.getPropertyValue('--g-accent'), accentPair('#E63946').accent);
  assert.ok(gym.classList.contains('has-poster'));
  assert.match(gym.style.getPropertyValue('--g-poster'), /bos\/poster\.jpg/);
  assert.ok(gym.classList.contains('has-cover'));
  assert.equal(gym.querySelector('.g-cover img').getAttribute('src'), 'https://cdn.example/bos/cover.jpg');
  assert.equal(doc.getElementById('join').style.getPropertyValue('--g-accent'), accentPair('#E63946').accent);

  // The Yoyo screens never carry a gym's look.
  for (const id of ['home', 'member-welcome', 'pick', 'owner-welcome', 'help']) {
    assert.equal(doc.getElementById(id).style.getPropertyValue('--g-accent'), '', id);
  }

  // Back, and a gym with no colour, poster or cover: nothing of BOS survives.
  click(doc, window, '#gym [data-go="back"]');
  click(doc, window, '#results .gym[data-slug="cocate-gym"]');
  await tick();
  assert.equal(gym.style.getPropertyValue('--g-accent'), '');
  assert.ok(!gym.classList.contains('has-poster'));
  assert.ok(!gym.classList.contains('has-cover'));
  assert.equal(gym.querySelector('[data-gym-mark] img').getAttribute('src'), 'https://cdn.example/cocate/logo.png');
});

test('a gym\'s branding that is not safe to draw is not drawn', async () => {
  BRANDS['bad-gym'] = { accent_color: 'red; background:url(x)', poster_url: 'https://x/")evil(', logo_url: 'javascript:alert(1)' };
  try {
    const { doc, window } = boot({ storage: { 'yoyo.mygym': JSON.stringify({ slug: 'bad-gym', name: 'Bad' }) } });
    click(doc, window, '[data-go="member"]');
    click(doc, window, '#mine-open');
    await tick();
    const gym = doc.getElementById('gym');
    assert.equal(gym.style.getPropertyValue('--g-accent'), '');
    assert.ok(!gym.classList.contains('has-poster'));
    assert.equal(gym.querySelector('[data-gym-mark] img'), null);
  } finally {
    delete BRANDS['bad-gym'];
  }
});

test('the gym saved on this phone comes FIRST, as "Continue to [Gym]", in its own mark', async () => {
  const { doc, window } = boot({
    storage: {
      'yoyo.mygym': JSON.stringify({ slug: 'bos-gym', name: 'BOS GYM' }),
      'yoyo.member.brand:bos-gym': JSON.stringify(BRANDS['bos-gym']),
    },
  });
  click(doc, window, '[data-go="member"]');
  const mine = doc.getElementById('mine');
  assert.ok(!mine.classList.contains('hidden'));
  assert.equal(doc.getElementById('mine-open').querySelector('b').textContent.trim(), 'Continue to BOS GYM');
  const find = doc.querySelector('#member-welcome [data-go="find"]');
  assert.ok(mine.compareDocumentPosition(find) & window.Node.DOCUMENT_POSITION_FOLLOWING, 'saved gym before Find my gym');
  assert.equal(doc.getElementById('mine-mark').style.getPropertyValue('--g-accent'), accentPair('#E63946').accent);
});

test('owners and staff have separate doors, each with its own icon, and the staff search says so', () => {
  const { doc, window } = boot();
  click(doc, window, '[data-go="owner"]');
  const owner = doc.querySelector('#owner-welcome [data-go="owner-signin"] use').getAttribute('href');
  const staff = doc.querySelector('#owner-welcome [data-go="staff-signin"] use').getAttribute('href');
  assert.notEqual(owner, staff);
  click(doc, window, '#owner-welcome [data-go="staff-signin"]');
  assert.equal(doc.getElementById('pick-title').textContent, 'Gym staff sign in');
  assert.doesNotMatch(doc.getElementById('pick-title').textContent + doc.getElementById('pick-sub').textContent, /login/i);
});

test('the owner apply screen says what every new gym gets — and nothing it does not', () => {
  const { doc } = boot();
  const promises = [...doc.querySelectorAll('#owner-apply .y-promises li')].map((li) => li.textContent.trim());
  // Only facts built into the software: the trial and the help a person gives
  // are switched per plan now (CLAUDE.md §47.1 Q4), and the app sells nothing.
  assert.deepEqual(promises, ['A verified listing in the Yoyo Gyms app', "Your gym's own branded app for members", "Each gym's data kept apart and private"]);
});
