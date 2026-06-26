// Rate limiter for sensitive endpoints (spec 6.3).
//
// Uses Upstash Redis (shared across all serverless instances) when configured
// via UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN. Otherwise falls back
// to a best-effort per-instance in-memory limiter. Either way: returns true if
// allowed; sends 429 (with Retry-After) and returns false if the limit is hit.
//
// NOTE: this is async — call sites use `if (!(await rateLimit(...))) return;`.
import { json } from './http.js';

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const useUpstash = !!(UPSTASH_URL && UPSTASH_TOKEN);

const buckets = new Map(); // in-memory fallback

function clientIp(req) {
  return (
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

function inMemory(id, limit, windowMs) {
  const now = Date.now();
  const bucket = buckets.get(id);
  if (!bucket || now > bucket.reset) {
    buckets.set(id, { count: 1, reset: now + windowMs });
    return { allowed: true };
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    return { allowed: false, retryAfter: Math.ceil((bucket.reset - now) / 1000) };
  }
  return { allowed: true };
}

// One round-trip: INCR, set TTL only on the first hit (NX), read remaining TTL.
async function viaUpstash(id, limit, windowMs) {
  const r = await fetch(`${UPSTASH_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([
      ['INCR', id],
      ['PEXPIRE', id, String(windowMs), 'NX'],
      ['PTTL', id],
    ]),
  });
  if (!r.ok) throw new Error(`upstash ${r.status}`);
  const data = await r.json();
  const count = Number(data?.[0]?.result || 0);
  const ttlMs = Number(data?.[2]?.result);
  if (count > limit) {
    const retryAfter = Math.ceil((ttlMs > 0 ? ttlMs : windowMs) / 1000);
    return { allowed: false, retryAfter };
  }
  return { allowed: true };
}

export async function rateLimit(req, res, { key = 'global', limit = 10, windowMs = 60_000 } = {}) {
  const id = `rl:${key}:${clientIp(req)}`;
  let result;
  try {
    result = useUpstash ? await viaUpstash(id, limit, windowMs) : inMemory(id, limit, windowMs);
  } catch {
    // If the shared store is unreachable, fall back rather than block traffic.
    result = inMemory(id, limit, windowMs);
  }
  if (!result.allowed) {
    res.setHeader('Retry-After', result.retryAfter || Math.ceil(windowMs / 1000));
    json(res, 429, { error: 'Too many requests. Please slow down and try again shortly.' });
    return false;
  }
  return true;
}
