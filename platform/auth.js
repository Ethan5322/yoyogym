// Platform authentication — the account that approves gyms and can reach every
// gym's secrets.
//
// A SEPARATE NAMESPACE from every gym login. A gym `owner` must never satisfy a
// platform check, which is why platform tokens carry `audience: "platform"` —
// the same mechanism that already separates member tokens from admin tokens,
// applied one level up.
//
// 2FA is REQUIRED here (D-077). It was deferred for gym staff because a gym
// admin can damage one gym; this account can reach all of them.
//
// TOTP IS IMPLEMENTED DIRECTLY rather than taken from a package. It is a short,
// stable, fully specified algorithm — an HMAC over a time counter, truncated —
// and `node:crypto` does the actual cryptography. The implementation is
// validated against RFC 6238's own published test vectors, and base32 against
// RFC 4648's, so correctness is checked against the specifications rather than
// against itself.
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);
const SESSION_TTL = process.env.PLATFORM_JWT_EXPIRES_IN || '8h';
const AUDIENCE = 'platform';

function secret() {
  const s = process.env.PLATFORM_JWT_SECRET || process.env.JWT_SECRET;
  if (!s) throw new Error('Missing PLATFORM_JWT_SECRET.');
  return s;
}

// ---------------------------------------------------------------------------
// Passwords — same hardening as the gym admin login, which is already proven.
// ---------------------------------------------------------------------------
export const hashPassword = (plain) => bcrypt.hash(plain, BCRYPT_ROUNDS);
export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);

// ---------------------------------------------------------------------------
// base32 (RFC 4648) — authenticator apps speak base32, not hex or raw bytes.
// ---------------------------------------------------------------------------
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  while (out.length % 8 !== 0) out += '=';
  return out;
}

export function base32Decode(str) {
  // Authenticator apps and humans add spaces and lower case; accept both.
  const clean = String(str || '').toUpperCase().replace(/[\s=]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) throw new Error('Invalid base32 character.');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// ---------------------------------------------------------------------------
// TOTP (RFC 6238) — HMAC-SHA1 over a 30-second counter, dynamically truncated.
// ---------------------------------------------------------------------------
const STEP = 30;

/** The code for one moment. `time` is unix seconds, so tests can pin it. */
export function totpCode(secretBytes, { time = Math.floor(Date.now() / 1000), digits = 6, step = STEP } = {}) {
  const counter = Math.floor(time / step);

  // 8-byte big-endian counter. Written in two halves because the value exceeds
  // 32 bits and bitwise operators in JS do not.
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);

  const hmac = createHmac('sha1', secretBytes).update(buf).digest();

  // Dynamic truncation (RFC 4226 §5.4): the low nibble of the last byte picks
  // the offset, then four bytes with the high bit masked off.
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(binary % 10 ** digits).padStart(digits, '0');
}

/**
 * Verify a submitted code, allowing one step of clock drift either way.
 *
 * Comparison is constant-time: a timing difference would let an attacker
 * discover a code digit by digit.
 */
export function verifyTotp(secretBytes, code, { time = Math.floor(Date.now() / 1000), digits = 6, window = 1 } = {}) {
  const given = String(code ?? '').replace(/\s/g, '');
  if (!new RegExp(`^\\d{${digits}}$`).test(given)) return false;

  for (let drift = -window; drift <= window; drift++) {
    const expected = totpCode(secretBytes, { time: time + drift * STEP, digits });
    const a = Buffer.from(expected);
    const b = Buffer.from(given);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

/** A new secret, base32 for the authenticator app. 20 bytes, as RFC 4226 advises. */
export const generateTotpSecret = () => base32Encode(randomBytes(20)).replace(/=/g, '');

/**
 * The URI behind the QR code an authenticator app scans.
 *
 * Built with encodeURIComponent rather than URLSearchParams: the latter is
 * form-encoding and turns a space into "+", which is a literal plus in a URI.
 * "Yoyo Gyms" would reach the authenticator as "Yoyo+Gyms". A test caught this.
 */
export function otpauthUri({ secret: b32, account, issuer = 'Yoyo Gyms' }) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const query = [
    `secret=${encodeURIComponent(b32)}`,
    `issuer=${encodeURIComponent(issuer)}`,
    'algorithm=SHA1',
    'digits=6',
    `period=${STEP}`,
  ].join('&');
  return `otpauth://totp/${label}?${query}`;
}

// ---------------------------------------------------------------------------
// Recovery codes — the difference between losing a phone and losing the
// platform. Shown once, stored only as hashes, each usable once.
// ---------------------------------------------------------------------------
const RECOVERY_CODE_COUNT = 10;

/** Readable groups, from a character set without look-alikes (no O/0, I/1). */
function readableCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const pick = () => alphabet[randomInt(0, alphabet.length)];
  const group = () => Array.from({ length: 5 }, pick).join('');
  return `${group()}-${group()}`;
}

/**
 * Hash a recovery code.
 *
 * SHA-256, not bcrypt, and deliberately so. bcrypt's cost factor exists to slow
 * down guessing of LOW-ENTROPY human-chosen passwords. A recovery code here is
 * 10 characters from a 32-character alphabet — about 50 bits of randomness — so
 * brute force is infeasible regardless of hash speed, and there is nothing for
 * a rainbow table to precompute. Using bcrypt at cost 12 for ten codes made the
 * test suite take two minutes and bought no security.
 */
const hashRecoveryCode = (code) =>
  createHash('sha256').update(String(code).trim().toUpperCase()).digest('hex');

export async function generateRecoveryCodes(count = RECOVERY_CODE_COUNT) {
  const codes = Array.from({ length: count }, readableCode);
  const hashes = codes.map(hashRecoveryCode);
  return { codes, hashes };
}

/**
 * Check a recovery code and consume it.
 *
 * Returns the remaining hashes so the caller can persist them. A failed attempt
 * consumes nothing.
 */
export async function verifyRecoveryCode(hashes, code) {
  const given = String(code ?? '').trim().toUpperCase();
  if (!given) return { ok: false, remainingHashes: hashes };

  const candidate = Buffer.from(hashRecoveryCode(given));
  for (let i = 0; i < hashes.length; i++) {
    const stored = Buffer.from(hashes[i]);
    // Constant-time, so a near-miss cannot be distinguished by timing.
    if (stored.length === candidate.length && timingSafeEqual(stored, candidate)) {
      const remainingHashes = hashes.filter((_, idx) => idx !== i);
      return { ok: true, remainingHashes };
    }
  }
  return { ok: false, remainingHashes: hashes };
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------
export function signPlatformToken(user, { audience = AUDIENCE, expiresIn = SESSION_TTL } = {}) {
  return jwt.sign(
    { sub: user.id, email: user.email, kind: user.kind || 'platform_staff' },
    secret(),
    { expiresIn, audience }
  );
}

/** Returns the payload, or null. Never throws at the caller. */
export function verifyPlatformToken(token) {
  try {
    return jwt.verify(token, secret(), { audience: AUDIENCE });
  } catch {
    return null;
  }
}
