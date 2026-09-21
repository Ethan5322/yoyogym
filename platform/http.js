// Platform HTTP layer — sessions and CSRF for server-rendered pages.
//
// A DIFFERENCE FROM THE GYM APP WORTH UNDERSTANDING
//
// The gym app is a React client holding a Bearer token in JavaScript and
// attaching it deliberately to each request. These platform pages are
// server-rendered HTML, so the session has to live in a COOKIE — and a browser
// attaches cookies automatically, to ANY request to this origin, including one
// triggered by a form on somebody else's website.
//
// That is CSRF, and it is a risk the gym app does not have. Two defences, both
// needed:
//
//   1. SameSite=Strict on the cookie, so the browser will not send it on a
//      cross-site request at all. This is the strong one.
//   2. A CSRF token bound to the session on every state-changing form. This is
//      the belt to the SameSite braces — it still holds if a browser is old,
//      misconfigured, or a future change relaxes SameSite for some flow.
//
// A valid session is NOT sufficient for a POST. That is the whole point.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { signPlatformToken, verifyPlatformToken } from './auth.js';

const COOKIE_NAME = 'yg_platform';
const CSRF_TTL_MS = 24 * 60 * 60 * 1000;

function secret() {
  const s = process.env.PLATFORM_JWT_SECRET || process.env.JWT_SECRET;
  if (!s) throw new Error('Missing PLATFORM_JWT_SECRET.');
  return s;
}

// ---------------------------------------------------------------------------
// Session cookie
// ---------------------------------------------------------------------------

/**
 * A Set-Cookie value for a signed-in platform user.
 *
 * Path is /platform so the cookie is never sent to the gym app — a gym
 * deployment has no business receiving a platform session, even by accident.
 */
export function sessionCookie(user, { maxAgeSeconds = 8 * 60 * 60 } = {}) {
  const token = signPlatformToken(user);
  return [
    `${COOKIE_NAME}=${token}`,
    'Path=/platform',
    'HttpOnly',            // JavaScript cannot read it, so XSS cannot steal it
    'Secure',              // never over plain HTTP
    'SameSite=Strict',     // the browser will not send it cross-site
    `Max-Age=${maxAgeSeconds}`,
  ].join('; ');
}

/** An immediately-expired cookie, for signing out. */
export function clearSessionCookie() {
  return [`${COOKIE_NAME}=`, 'Path=/platform', 'HttpOnly', 'Secure', 'SameSite=Strict', 'Max-Age=0'].join('; ');
}

function cookieValue(req, name) {
  const header = req?.headers?.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return null;
}

/** The signed-in user's token payload, or null. Never throws. */
export function readSession(req) {
  const raw = cookieValue(req, COOKIE_NAME);
  if (!raw) return null;
  return verifyPlatformToken(raw);
}

// ---------------------------------------------------------------------------
// CSRF
// ---------------------------------------------------------------------------

/**
 * A token bound to one session and one moment.
 *
 * Format: `<issuedAt>.<nonce>.<hmac>`. Keyed on the user id, so a token minted
 * for one session cannot be replayed in another — which matters if two people
 * ever share the platform.
 */
export function issueCsrfToken(userId, { issuedAt = Date.now(), nonce = randomBytes(12).toString('hex') } = {}) {
  const payload = `${issuedAt}.${nonce}`;
  const mac = createHmac('sha256', secret()).update(`${userId}.${payload}`).digest('hex');
  return `${payload}.${mac}`;
}

/** True only for a well-formed, unexpired token issued to this user. */
export function verifyCsrfToken(token, userId) {
  if (typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;

  const [issuedAt, nonce, mac] = parts;
  const age = Date.now() - Number(issuedAt);
  if (!Number.isFinite(age) || age < 0 || age > CSRF_TTL_MS) return false;

  const expected = createHmac('sha256', secret()).update(`${userId}.${issuedAt}.${nonce}`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(mac);
  // Constant-time: a timing difference would leak the signature byte by byte.
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// The guard
// ---------------------------------------------------------------------------

/**
 * Require a signed-in platform user, and for state-changing methods a valid
 * CSRF token.
 *
 * Returns the session, or null having already written the response.
 */
export function requireSession(req, res, { csrfToken = null } = {}) {
  const session = readSession(req);

  if (!session) {
    // A redirect rather than a 401: this is a page, and a human is looking at it.
    res.writeHead(302, { Location: '/platform/login' });
    res.end();
    return null;
  }

  const method = (req.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    if (!verifyCsrfToken(csrfToken, session.sub)) {
      // A valid session is deliberately not enough here.
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Request rejected. Please reload the page and try again.');
      return null;
    }
  }

  return session;
}

/** Re-exported so callers need only this module. */
export { signPlatformToken, verifyPlatformToken, jwt };
