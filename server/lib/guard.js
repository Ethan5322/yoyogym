// The first thing every API router does (CLAUDE.md §46): refuse a body larger
// than the route needs, and slow down one address sending far more requests
// than a person — or a gym's front desk at its busiest — ever would.
//
// SIZE: 1 MB for every form and JSON call. Routes that carry face photos, a
// logo or a member import may send up to 4 MB (Vercel's own cap is 4.5 MB).
// The body is refused on its declared length, before anything reads it.
//
// RATE: a generous ceiling per address, counted in this server instance's
// memory — no network call on every request. It stops one runaway client or a
// simple flood; the sensitive routes (sign-in, registration, documents) keep
// their own, stricter limits in ratelimit.js, shared across instances when
// Upstash is configured.
import { json } from './http.js';

export const MAX_BODY_BYTES = 1024 * 1024;
export const MAX_PHOTO_BODY_BYTES = 4 * 1024 * 1024;

const GLOBAL_LIMIT = 300; // requests per minute, per address, per instance
const WINDOW_MS = 60_000;
const seen = new Map();

/** The caller's address, as Vercel reports it (it sets x-real-ip itself). */
function clientIp(req) {
  return (
    req.headers['x-real-ip'] ||
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

function overLimit(ip, now) {
  // An address that has gone quiet is forgotten, so the map cannot grow
  // without end under a spread-out flood.
  if (seen.size > 5000) {
    for (const [key, b] of seen) if (now > b.reset) seen.delete(key);
  }
  const bucket = seen.get(ip);
  if (!bucket || now > bucket.reset) {
    seen.set(ip, { count: 1, reset: now + WINDOW_MS });
    return 0;
  }
  bucket.count += 1;
  return bucket.count > GLOBAL_LIMIT ? Math.ceil((bucket.reset - now) / 1000) : 0;
}

/**
 * True to carry on; false once it has answered 413 or 429 itself.
 * @param {object} [opts] { maxBytes } — the route's own size limit.
 */
export function guardRequest(req, res, { maxBytes = MAX_BODY_BYTES } = {}) {
  const declared = Number(req.headers['content-length'] || 0);
  if (declared > maxBytes) {
    json(res, 413, { error: 'That is more than this form can send. Please try a smaller file.' });
    return false;
  }
  // An address nobody reported is not counted: every such request would share
  // ONE bucket, and one busy minute would lock everybody out.
  const ip = clientIp(req);
  const wait = ip === 'unknown' ? 0 : overLimit(ip, Date.now());
  if (wait) {
    res.setHeader('Retry-After', wait);
    json(res, 429, { error: 'Too many requests. Please slow down and try again shortly.' });
    return false;
  }
  return true;
}

/** For tests: start counting again. */
export function resetGuard() {
  seen.clear();
}
