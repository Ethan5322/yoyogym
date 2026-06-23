// Lightweight in-memory rate limiter for sensitive endpoints (spec 6.3).
// NOTE: serverless instances are ephemeral, so this is best-effort per-instance
// protection. For strong, shared rate limiting in production use a store like
// Upstash Redis. Returns true if allowed; sends 429 and returns false if not.
import { json } from './http.js';

const buckets = new Map();

export function rateLimit(req, res, { key = 'global', limit = 10, windowMs = 60_000 } = {}) {
  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';
  const id = `${key}:${ip}`;
  const now = Date.now();
  const bucket = buckets.get(id);

  if (!bucket || now > bucket.reset) {
    buckets.set(id, { count: 1, reset: now + windowMs });
    return true;
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    res.setHeader('Retry-After', Math.ceil((bucket.reset - now) / 1000));
    json(res, 429, { error: 'Too many requests. Please slow down and try again shortly.' });
    return false;
  }
  return true;
}
