// The Yoyo Gyms brand everywhere (CLAUDE.md §37): lime and the logo as the
// default, a gym's own colour still winning, and nothing ever unreadable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  BRAND,
  DEFAULT_ACCENT,
  accentOrDefault,
  inkOn,
  printInk,
  contrast,
  deepen,
} from '../shared/brand.js';
import { memberTemplates } from '../server/lib/notify/templates.js';

// ---------------------------------------------------------------------------
// The rules
// ---------------------------------------------------------------------------

test('THE DEFAULT IS THE YOYO LIME, AND A GYM\'S OWN COLOUR WINS', () => {
  assert.equal(DEFAULT_ACCENT, BRAND.lime);
  assert.equal(accentOrDefault(undefined), BRAND.lime);
  assert.equal(accentOrDefault('red; background:url(x)'), BRAND.lime, 'not a colour, not applied');
  assert.equal(accentOrDefault('#e63946'), '#E63946', 'a gym that saved red keeps red (§37.1 Q3)');
});

test('TEXT ON A GYM\'S COLOUR IS ALWAYS READABLE', () => {
  assert.equal(inkOn(BRAND.lime), BRAND.limeInk, 'dark on lime');
  assert.equal(inkOn('#E63946'), '#FFFFFF', 'a red gym keeps its white-on-red buttons');
  for (const c of ['#BFF642', '#E63946', '#1E90FF', '#C8922A', '#6047A2', '#FFFFFF', '#000000', '#FFD400']) {
    assert.ok(contrast(c, inkOn(c)) >= 3, `${c} with ${inkOn(c)}`);
  }
});

test('ON WHITE PAPER, A LIGHT ACCENT IS NEVER USED FOR WORDS', () => {
  assert.equal(printInk(BRAND.lime), BRAND.navy, 'lime text on white cannot be read');
  assert.equal(printInk('#E63946'), '#E63946', 'a dark accent is kept');
  assert.ok(contrast(printInk('#FFFF00'), '#FFFFFF') >= 3);
});

test('a gradient\'s far end is a real, darker colour', () => {
  assert.match(deepen(BRAND.lime), /^#[0-9A-F]{6}$/);
  assert.notEqual(deepen(BRAND.lime), BRAND.lime);
});

// ---------------------------------------------------------------------------
// Emails
// ---------------------------------------------------------------------------

test('A MEMBER EMAIL CARRIES THE GYM\'S COLOUR — LIME WHEN IT HAS NONE', () => {
  const vars = { gymName: 'KOM', member: { full_name: 'Thandi', membership_number: 'GYM-2026-000123' }, weekLabel: 'This week', items: [] };
  for (const [key, tpl] of Object.entries(memberTemplates)) {
    const plain = tpl(vars);
    if (!plain?.html) continue;
    assert.ok(!plain.html.includes('%%ACCENT%%'), `${key}: the marker never reaches a member`);
    assert.ok(!/E63946/i.test(plain.html), `${key}: no red default`);
    assert.ok(plain.html.includes(BRAND.lime), `${key}: the lime, with no colour chosen`);
    const red = tpl({ ...vars, accent: '#E63946' });
    assert.ok(red.html.includes('#E63946') && !red.html.includes(BRAND.lime), `${key}: a red gym's email is red`);
  }
  const welcome = memberTemplates.welcome({ ...vars, accent: '#1E90FF' });
  assert.match(welcome.html, /#1E90FF/, 'a gym\'s own colour');
  assert.match(memberTemplates.welcome(vars).html, new RegExp(BRAND.lime), 'or the lime');
});

// ---------------------------------------------------------------------------
// Nothing left in the old red
// ---------------------------------------------------------------------------

/** Every source file under `dir`, recursively. */
function files(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(js|jsx|mjs|css|html|svg)$/.test(name)) out.push(p);
  }
  return out;
}

test('THE OLD RED IS NO LONGER ANYBODY\'S DEFAULT', () => {
  // Allowed: the Settings help text naming the lime, and a semantic ERROR red
  // in the Tailwind palette, which is a warning colour and not the brand.
  const offenders = [];
  for (const p of [...files('src'), ...files('platform'), ...files('server'), ...files('shared'), 'index.html', 'public/icon.svg', 'public/gym-pattern.svg']) {
    const text = readFileSync(p, 'utf8');
    if (/#E63946|230,\s*57,\s*70/i.test(text)) offenders.push(p);
  }
  assert.deepEqual(offenders, []);
});

test('every PDF and the ID card draw the logo through the one brand helper', () => {
  for (const f of ['receiptPdf.js', 'boardReportPdf.js', 'credentialPdf.js', 'staffContractPdf.js']) {
    assert.match(readFileSync(`src/lib/${f}`, 'utf8'), /brandBand\(doc/, f);
  }
  assert.match(readFileSync('src/lib/pdf/generateMembershipPdf.js', 'utf8'), /documentLogo\('dark'\)/);
  assert.match(readFileSync('src/lib/idcard.js', 'utf8'), /documentLogo\('dark'\)/);
  assert.match(readFileSync('platform/agreement.js', 'utf8'), /YOYO_LOGO_ON_DARK/);
});

test('the embedded logo is loaded only where documents are made, not on every page', () => {
  const branding = readFileSync('src/lib/branding.js', 'utf8');
  assert.ok(!/pdf\/brand\.js|yoyo-logo/.test(branding), 'registration must not carry the document logo');
});

test('IDS AND PDFS ALWAYS CARRY THE YOYO GYMS LOGO; MEMBERS SEE THE GYM\'S OWN ICON', () => {
  // CLAUDE.md §37.1 Q7.
  const docs = readFileSync('src/lib/pdf/brand.js', 'utf8');
  assert.ok(!/logo_url|gymLogo|preloadGymLogo/.test(docs), 'a gym logo never replaces the Yoyo logo on a document');
  for (const f of ['src/pages/Splash.jsx', 'src/chatbot/ChatWindow.jsx', 'src/pages/MemberPortal.jsx', 'src/pages/PublicProfile.jsx']) {
    const src = readFileSync(f, 'utf8');
    assert.match(src, /<GymIcon/, f);
    assert.ok(!/<BrandLogo/.test(src), `${f}: no Yoyo logo on a member screen`);
  }
  for (const f of ['src/components/AdminShell.jsx', 'src/pages/admin/Login.jsx']) {
    assert.match(readFileSync(f, 'utf8'), /<BrandLogo/, f);
  }
});

test('NO SCREEN, ID OR PDF PRINTS THE OLD SINGLE-GYM NAME', () => {
  const offenders = [];
  for (const p of [...files('src'), ...files('server')]) {
    // Comments may mention the history; only code and markup count.
    const code = readFileSync(p, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    if (/Yoyo GYM\b/i.test(code)) offenders.push(p); // "Yoyo Gyms", the platform, is right
  }
  assert.deepEqual(offenders, []);
});

// ---------------------------------------------------------------------------
// The gym's logo upload (CLAUDE.md §37.1 Q6)
// ---------------------------------------------------------------------------

test('A GYM LOGO IS A PNG, JPG OR WEBP (OR AN HTTPS LINK), AND SMALL', async () => {
  process.env.JWT_SECRET ||= 'test-secret-for-logo';
  const { logoProblem } = await import('../server/handlers/admin/settings.js');
  assert.equal(logoProblem(''), null, 'no logo is fine');
  assert.equal(logoProblem('data:image/png;base64,iVBORw0KGgo='), null);
  assert.equal(logoProblem('data:image/webp;base64,UklGRg=='), null);
  assert.equal(logoProblem('https://kom.co.za/logo.png'), null);
  assert.match(logoProblem('data:image/svg+xml;base64,PHN2Zz4='), /PNG, JPG or WebP/, 'SVG can carry script');
  assert.match(logoProblem('javascript:alert(1)'), /PNG, JPG or WebP/);
  assert.match(logoProblem('http://kom.co.za/logo.png'), /https/);
  assert.match(logoProblem('https://x/"><script>'), /PNG, JPG or WebP/);
  assert.match(logoProblem('data:image/png;base64,' + 'A'.repeat(400 * 1024)), /too large/);
});

test('A COVER PICTURE MUST BE ONE UPLOADED FOR THIS GYM (§38.1 Q5)', async () => {
  process.env.JWT_SECRET ||= 'test-secret-for-cover';
  const { coverProblem } = await import('../server/handlers/admin/settings.js');
  const KOM = 'https://x.supabase.co/storage/v1/object/public/gym-branding/kom/';
  assert.equal(coverProblem('', KOM), null, 'no cover is fine');
  assert.equal(coverProblem(`${KOM}cover-1759000000000.jpg`, KOM), null);
  assert.match(coverProblem('https://x.supabase.co/storage/v1/object/public/gym-branding/other/cover-1.jpg', KOM), /not one uploaded for this gym/, 'never another gym\'s folder');
  assert.match(coverProblem(`${KOM}../other/cover-1.jpg`, KOM), /not valid/);
  assert.match(coverProblem(`${KOM}cover-1.jpg?"><script>`, KOM), /not valid/);
  assert.match(coverProblem('https://evil.example/a.jpg', KOM), /not one uploaded/);
});

// ---------------------------------------------------------------------------
// Each gym's poster, and the admin panel (CLAUDE.md §39.1)
// ---------------------------------------------------------------------------

test('A POSTER MUST BE ONE UPLOADED FOR THIS GYM, NAMED BY THIS SYSTEM (§39.1 Q3)', async () => {
  process.env.JWT_SECRET ||= 'test-secret-for-poster';
  const { pictureProblem } = await import('../server/handlers/admin/settings.js');
  const KOM = 'https://x.supabase.co/storage/v1/object/public/gym-branding/kom/';
  assert.equal(pictureProblem('poster', `${KOM}poster-1759000000000.jpg`, KOM), null);
  assert.match(pictureProblem('poster', `${KOM}cover-1759000000000.jpg`, KOM), /not valid/, 'a cover is not a poster');
  assert.match(pictureProblem('poster', 'https://x.supabase.co/storage/v1/object/public/gym-branding/other/poster-1.jpg', KOM), /not one uploaded/);
  assert.match(pictureProblem('poster', `${KOM}../x/poster-1.jpg`, KOM), /not valid/);
});

test('THE GYM\'S POSTER SITS BEHIND EVERY MEMBER SCREEN AND THE ADMIN SIGN-IN (§39.1 Q4)', () => {
  for (const f of ['src/pages/Splash.jsx', 'src/pages/Register.jsx', 'src/pages/MemberPortal.jsx', 'src/pages/PublicProfile.jsx', 'src/pages/admin/Login.jsx']) {
    assert.match(readFileSync(f, 'utf8'), /<GymBackdrop \/>/, f);
  }
  const backdrop = readFileSync('src/components/GymBackdrop.jsx', 'utf8');
  assert.match(backdrop, /SAFE\.test\(b\.poster_url\)/, 'only the gym\'s own https picture');
  assert.match(readFileSync('src/index.css', 'utf8'), /isolation: isolate;/, 'painted above the page background, below the page');
  assert.match(readFileSync('src/components/AdminShell.jsx', 'utf8'), /admin-brand__poster/, 'behind the gym\'s name in the admin sidebar');
});

test('A STATUS IS A COLOURED LABEL, NOT RED FOR EVERYTHING (§39.1 Q4)', () => {
  const ui = readFileSync('src/components/ui.jsx', 'utf8');
  assert.match(ui, /active: 'good'/);
  assert.match(ui, /expiring: 'warn'/);
  assert.match(ui, /suspended: 'bad'/);
  assert.match(readFileSync('src/pages/admin/MembersList.jsx', 'utf8'), /<StatusPill status=\{m\.status\} \/>/);
  assert.ok(!/text-accent">\{m\.status\}/.test(readFileSync('src/pages/admin/MembersList.jsx', 'utf8')));
});
