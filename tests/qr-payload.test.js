// What a scanned QR code means.
//
// A QR on a gym wall is photographed by strangers and lives in camera rolls.
// Whatever is inside it is public, permanently, and cannot be recalled — so
// most of these tests are about what a payload must NEVER carry.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readQrPayload, gymQrUrl, pathForPayload } from '../shared/qr-payload.js';

const HOST = 'https://yoyogyms.com';

// ---------------------------------------------------------------------------
// A gym
// ---------------------------------------------------------------------------

test('a gym code names a gym', () => {
  assert.deepEqual(readQrPayload(`${HOST}/g/kom`), { kind: 'gym', slug: 'kom' });
});

test('a bare slug works too, for a code typed by hand', () => {
  assert.deepEqual(readQrPayload('kom'), { kind: 'gym', slug: 'kom' });
});

test('the generated URL round-trips through the reader', () => {
  // The one property that matters: what a gym prints is what the app reads.
  const url = gymQrUrl(HOST, 'kom');
  assert.equal(readQrPayload(url).slug, 'kom');
});

test('an unsafe slug is refused at generation, not sanitised', () => {
  for (const bad of ['../etc', 'BOS GYM', 'a;drop']) {
    assert.throws(() => gymQrUrl(HOST, bad), `${bad} should be refused`);
  }
});

// ---------------------------------------------------------------------------
// What must never be in a QR (CLAUDE.md §14)
// ---------------------------------------------------------------------------

test('A CODE CARRYING A VERIFICATION CODE IS REFUSED', () => {
  // POST /api/document accepts membership number + verification code with no
  // session. A QR carrying that pair is a document-access token anybody can
  // photograph off a wall.
  const payload = readQrPayload(`${HOST}/g/kom/p/member/GYM-2026-1?code=ABC12345`);

  assert.equal(payload.kind, 'unknown');
  assert.match(payload.reason, /should not/i);
});

test('every kind of secret parameter is refused', () => {
  for (const param of ['code', 'verification_code', 'token', 'password', 'secret', 'key', 'pin']) {
    const payload = readQrPayload(`${HOST}/g/kom?${param}=anything`);
    assert.equal(payload.kind, 'unknown', `${param} must be refused`);
  }
});

test('the refusal happens BEFORE the payload is interpreted', () => {
  // A payload carrying a secret is not one to read carefully. Accepting the
  // gym part and ignoring the rest would teach whoever made it that it works.
  const payload = readQrPayload(`${HOST}/g/kom?token=x`);
  assert.equal(payload.slug, undefined, 'nothing is extracted from it at all');
});

// ---------------------------------------------------------------------------
// A member's own code
// ---------------------------------------------------------------------------

test('a member code names the member but DOES NOT SIGN THEM IN', () => {
  const payload = readQrPayload(`${HOST}/g/kom/p/member/GYM-2026-000123`);

  assert.equal(payload.kind, 'member');
  assert.equal(payload.slug, 'kom');
  assert.equal(payload.membershipNumber, 'GYM-2026-000123');

  // It opens the sign-in with the number filled in. The member still proves
  // who they are (CLAUDE.md §14).
  const path = pathForPayload(payload);
  assert.match(path, /\/member\?member=/);
  assert.ok(!/token|session|auth/i.test(path), 'nothing authenticating is carried');
});

// ---------------------------------------------------------------------------
// Rubbish
// ---------------------------------------------------------------------------

test('somebody else\'s QR code is not a Yoyo code', () => {
  for (const other of ['https://example.com/anything', 'WIFI:S:cafe;T:WPA;P:hunter2;;', 'tel:+27821234567']) {
    assert.equal(readQrPayload(other).kind, 'unknown');
  }
});

test('nothing scanned says so plainly', () => {
  assert.match(readQrPayload('').reason, /Nothing was scanned/i);
  assert.equal(readQrPayload(null).kind, 'unknown');
});

test('an unknown payload routes nowhere', () => {
  assert.equal(pathForPayload({ kind: 'unknown', reason: 'x' }), null);
});
