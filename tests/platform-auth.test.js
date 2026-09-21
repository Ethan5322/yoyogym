// Platform authentication tests, written before the implementation.
//
// This guards the single account that approves every gym and can reach every
// gym's secrets, so it gets a second factor that gym staff do not (D-077).
//
// TOTP is implemented directly rather than pulled from a package, so it is
// validated against **RFC 6238's own published test vectors** and base32
// against **RFC 4648's**. A cryptographic routine tested only against itself
// proves nothing except that it is consistently wrong.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// The suite must run with no environment configured — CI checks out and runs
// `npm test` with nothing set. A throwaway signing key keeps the token tests
// self-contained rather than requiring a secret to exist in CI.
process.env.PLATFORM_JWT_SECRET ||= 'test-only-signing-key-not-used-anywhere';

import {
  base32Encode,
  base32Decode,
  totpCode,
  verifyTotp,
  generateTotpSecret,
  otpauthUri,
  generateRecoveryCodes,
  verifyRecoveryCode,
  signPlatformToken,
  verifyPlatformToken,
} from '../platform/auth.js';

// ---------------------------------------------------------------------------
// base32 — RFC 4648 section 10 test vectors
// ---------------------------------------------------------------------------
test('base32 matches the RFC 4648 test vectors', () => {
  const vectors = [
    ['', ''],
    ['f', 'MY======'],
    ['fo', 'MZXQ===='],
    ['foo', 'MZXW6==='],
    ['foob', 'MZXW6YQ='],
    ['fooba', 'MZXW6YTB'],
    ['foobar', 'MZXW6YTBOI======'],
  ];
  for (const [plain, encoded] of vectors) {
    assert.equal(base32Encode(Buffer.from(plain)), encoded, `encode ${JSON.stringify(plain)}`);
    assert.equal(base32Decode(encoded).toString(), plain, `decode ${encoded}`);
  }
});

test('base32 decoding ignores spaces and case, as authenticator apps produce', () => {
  assert.equal(base32Decode('mzxw 6ytb').toString(), 'fooba');
});

// ---------------------------------------------------------------------------
// TOTP — RFC 6238 appendix B test vectors (SHA-1, 8 digits, 30s step)
// ---------------------------------------------------------------------------
const RFC_SECRET = Buffer.from('12345678901234567890');

test('TOTP matches the RFC 6238 published test vectors', () => {
  const vectors = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ];
  for (const [seconds, expected] of vectors) {
    assert.equal(
      totpCode(RFC_SECRET, { time: seconds, digits: 8 }),
      expected,
      `RFC 6238 vector at T=${seconds}`
    );
  }
});

test('six-digit codes are the last six of the RFC value', () => {
  assert.equal(totpCode(RFC_SECRET, { time: 59, digits: 6 }), '287082');
});

test('verification accepts the current code', () => {
  const now = 1_700_000_000;
  const code = totpCode(RFC_SECRET, { time: now });
  assert.equal(verifyTotp(RFC_SECRET, code, { time: now }), true);
});

test('verification tolerates one step of clock drift, but not two', () => {
  const now = 1_700_000_000;
  const past = totpCode(RFC_SECRET, { time: now - 30 });
  const future = totpCode(RFC_SECRET, { time: now + 30 });
  const tooOld = totpCode(RFC_SECRET, { time: now - 90 });

  assert.equal(verifyTotp(RFC_SECRET, past, { time: now }), true, 'one step behind is accepted');
  assert.equal(verifyTotp(RFC_SECRET, future, { time: now }), true, 'one step ahead is accepted');
  assert.equal(verifyTotp(RFC_SECRET, tooOld, { time: now }), false, 'three steps behind is rejected');
});

test('verification rejects rubbish without throwing', () => {
  const now = 1_700_000_000;
  for (const bad of ['', '000000', 'abcdef', null, undefined, '12345', '1234567']) {
    assert.equal(verifyTotp(RFC_SECRET, bad, { time: now }), false, `rejects ${JSON.stringify(bad)}`);
  }
});

test('a generated secret is usable and unique', () => {
  const a = generateTotpSecret();
  const b = generateTotpSecret();
  assert.notEqual(a, b);
  assert.ok(/^[A-Z2-7]+$/.test(a), 'base32 alphabet only, so an authenticator app can read it');
  const code = totpCode(base32Decode(a), { time: 1_700_000_000 });
  assert.match(code, /^\d{6}$/);
});

test('the otpauth URI carries the issuer and account so scanning just works', () => {
  const uri = otpauthUri({ secret: 'JBSWY3DPEHPK3PXP', account: 'owner@yoyogyms.com', issuer: 'Yoyo Gyms' });
  assert.ok(uri.startsWith('otpauth://totp/'));
  assert.ok(uri.includes('secret=JBSWY3DPEHPK3PXP'));
  assert.ok(uri.includes('issuer=Yoyo%20Gyms'));
});

// ---------------------------------------------------------------------------
// Recovery codes — the difference between losing a phone and losing the platform
// ---------------------------------------------------------------------------
test('recovery codes are returned in plain ONCE, and stored only as hashes', async () => {
  const { codes, hashes } = await generateRecoveryCodes();

  assert.equal(codes.length, 10);
  assert.equal(hashes.length, 10);
  for (const code of codes) {
    assert.ok(!hashes.includes(code), 'a plain code must never appear in the stored set');
  }
});

test('a recovery code works once and is then spent', async () => {
  const { codes, hashes } = await generateRecoveryCodes();

  const first = await verifyRecoveryCode(hashes, codes[0]);
  assert.equal(first.ok, true);
  assert.equal(first.remainingHashes.length, 9, 'the used code is consumed');

  const again = await verifyRecoveryCode(first.remainingHashes, codes[0]);
  assert.equal(again.ok, false, 'a spent code must never work twice');
});

test('a wrong recovery code changes nothing', async () => {
  const { hashes } = await generateRecoveryCodes();
  const r = await verifyRecoveryCode(hashes, 'not-a-real-code');
  assert.equal(r.ok, false);
  assert.equal(r.remainingHashes.length, 10, 'a failed attempt must not consume a code');
});

// ---------------------------------------------------------------------------
// Sessions — a separate namespace from every gym login
// ---------------------------------------------------------------------------
test('a platform token is not accepted as a member or admin token', () => {
  const token = signPlatformToken({ id: 'u1', email: 'owner@yoyogyms.com', kind: 'platform_staff' });
  const decoded = verifyPlatformToken(token);

  assert.equal(decoded.sub, 'u1');
  assert.equal(decoded.aud, 'platform', 'the audience claim is what keeps the namespaces apart');
});

test('a token signed for a different audience is rejected', () => {
  // A gym member token must never open the platform panel.
  const memberish = signPlatformToken({ id: 'u1', email: 'x@y.z' }, { audience: 'member' });
  assert.equal(verifyPlatformToken(memberish), null);
});
