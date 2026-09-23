// The gym's own QR codes, and whether its own app accepts them.
//
// Every code this system generated was gym-less: /register, /member,
// /p/m/<number>, /admin/login. The Yoyo Gyms app only recognises /g/<slug>/…,
// because that is how many gyms live in one app (D-036).
//
// So a gym printed its poster from its own admin panel, a member scanned it
// with the app, and the app answered "That is not a Yoyo Gyms code" — about
// the gym's own code, at the entrance, which is the one place the whole
// product has to work.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { readQrPayload, pathForPayload } from '../shared/qr-payload.js';

const HOSTS = ['yoyogym.vercel.app'];

// ---------------------------------------------------------------------------
// What the gym prints
// ---------------------------------------------------------------------------

test('THE ADMIN QR PAGE PUTS THE GYM IN THE URL', () => {
  // Read as source because this is a React page: what matters is that the
  // URLs are BUILT from the slug rather than from the origin alone.
  const source = readFileSync('src/pages/admin/QrCodes.jsx', 'utf8');

  assert.match(source, /codesFor\(currentGymSlug\(\)\)/, 'the slug decides the codes');
  assert.match(source, /\$\{origin\}\/g\/\$\{encodeURIComponent\(slug\)\}/);
});

test('single-gym mode still prints the URLs it always printed', () => {
  // The existing deployment has no slug, and its codes must not change shape
  // underneath it.
  const source = readFileSync('src/pages/admin/QrCodes.jsx', 'utf8');

  assert.match(source, /const base = slug \? .* : origin;/);
});

test("A MEMBER'S OWN CARD NAMES THEIR GYM", () => {
  const source = readFileSync('src/pages/MemberPortal.jsx', 'utf8');

  assert.match(source, /function memberCardUrl/);
  assert.match(source, /\/g\/\$\{encodeURIComponent\(slug\)\}\/p\/m\//);
  assert.ok(!/\$\{window\.location\.origin\}\/p\/m\/\$\{data\.member/.test(source), 'the gym-less form is gone');
});

// ---------------------------------------------------------------------------
// What the app then reads
// ---------------------------------------------------------------------------

test('a gym-scoped poster resolves to that gym', () => {
  const payload = readQrPayload('https://yoyogym.vercel.app/g/kom/register?src=qr', HOSTS);

  assert.equal(payload.kind, 'gym');
  assert.equal(payload.slug, 'kom');
});

test("a gym-scoped member card names the member, and does NOT sign them in", () => {
  const payload = readQrPayload('https://yoyogym.vercel.app/g/kom/p/m/GYM-2026-000123', HOSTS);

  assert.equal(payload.kind, 'member');
  assert.equal(payload.membershipNumber, 'GYM-2026-000123');
  assert.match(pathForPayload(payload), /\/g\/kom\/member\?member=GYM-2026-000123/);
  assert.ok(!/token|session|code=/.test(pathForPayload(payload)));
});

// ---------------------------------------------------------------------------
// The codes already on the wall
// ---------------------------------------------------------------------------

test('A CODE PRINTED BEFORE SLUGS IS NOT CALLED A FAKE', () => {
  // The vault is explicit that a new scheme must be additive rather than
  // orphan printed material (09 - QR-Code Architecture). The app cannot route
  // one of these — nothing in it says which gym — but calling the gym's own
  // poster "not a Yoyo Gyms code" is the worst of the available answers.
  for (const url of [
    'https://yoyogym.vercel.app/register?src=qr',
    'https://yoyogym.vercel.app/member?src=qr',
    'https://yoyogym.vercel.app/p/m/GYM-2026-000123',
    'https://yoyogym.vercel.app/?src=qr',
  ]) {
    const payload = readQrPayload(url, HOSTS);
    assert.equal(payload.kind, 'gymless', url);
    assert.match(payload.reason, /search for your gym by name/i);
  }
});

test('a gym-less code routes nowhere, because there is nowhere to route it', () => {
  const payload = readQrPayload('https://yoyogym.vercel.app/register', HOSTS);
  assert.equal(pathForPayload(payload), null);
});

test('SOMEBODY ELSE’S URL IS STILL AN UNKNOWN CODE', () => {
  // The forgiving reading applies only to hosts the app already talks to.
  // Without that, any /register link anywhere would be treated as ours.
  const payload = readQrPayload('https://not-us.example/register?src=qr', HOSTS);

  assert.equal(payload.kind, 'unknown');
  assert.match(payload.reason, /not a Yoyo Gyms code/);
});

test('a Yoyo URL that is not an entry point is still unknown', () => {
  // The platform panel is not somewhere a scanned poster should send a member.
  const payload = readQrPayload('https://yoyogym.vercel.app/platform/login', HOSTS);
  assert.equal(payload.kind, 'unknown');
});

test('with no known hosts, nothing is treated as legacy', () => {
  assert.equal(readQrPayload('https://yoyogym.vercel.app/register').kind, 'unknown');
});

test('A SECRET IN THE PAYLOAD STILL BEATS THE FORGIVING PATH', () => {
  // The legacy branch must not become a way in for a code carrying a
  // verification code — that pair is a document-access token (§11).
  const payload = readQrPayload(
    'https://yoyogym.vercel.app/member?verification_code=ABC12345',
    HOSTS
  );

  assert.equal(payload.kind, 'unknown');
  assert.match(payload.reason, /information it should not/i);
});

// ---------------------------------------------------------------------------
// The app screen
// ---------------------------------------------------------------------------

test('the scanner hands the allowed hosts to the reader', () => {
  const app = readFileSync('apps/mobile/www/app.js', 'utf8');
  assert.match(app, /readQrPayload\(text, shell\.allowedHosts\)/);
});

test('A GYM-LESS SCAN OPENS THE GYM PICKER, NOT A RETRY BUTTON', () => {
  // Scanning it again produces the same answer, so "Try again" would be a
  // button that cannot work. The way out is to search by name.
  const app = readFileSync('apps/mobile/www/app.js', 'utf8');
  const branch = app.slice(app.indexOf("payload.kind === 'gymless'"), app.indexOf("payload.kind === 'unknown'"));

  assert.match(branch, /show\('pick'\)/);
  assert.ok(!/scanFailed/.test(branch), 'not the retry path');
});

// ---------------------------------------------------------------------------
// The member portal
// ---------------------------------------------------------------------------

test('THE SCANNED NUMBER IS ACTUALLY FILLED IN', () => {
  // qr-payload.js promises, in as many words, that the app "opens that gym's
  // sign-in with the number filled in". The portal ignored the parameter, so
  // scanning your own card landed on an empty form.
  const source = readFileSync('src/pages/MemberPortal.jsx', 'utf8');

  assert.match(source, /function scannedNumber/);
  assert.match(source, /useState\(scannedNumber\)/);
  assert.match(source, /get\('member'\)/);
});

test('a filled-in number is not a session', () => {
  const source = readFileSync('src/pages/MemberPortal.jsx', 'utf8');
  const fn = source.slice(source.indexOf('function scannedNumber'), source.indexOf('function MemberLogin'));

  assert.match(fn, /\[A-Za-z0-9-\]\{1,32\}/, 'anything else is refused rather than trusted');
  assert.ok(!/setMemberToken|onLoggedIn/.test(fn), 'it fills a field and nothing more');
});
