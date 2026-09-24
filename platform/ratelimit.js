// Rate limiting for the platform's public endpoints.
//
// A separate file from server/lib/ratelimit.js for the boundary reason
// (D-081): platform/ imports nothing from server/. The behaviour is the same —
// Upstash Redis when configured, so the count is shared across serverless
// instances; a per-instance in-memory count otherwise, which is weaker but is
// never "no limit".
//
// Unlike the gym version this one only ANSWERS. It returns true or false and
// leaves the response to the caller, because the platform has two
// representations (HTML and JSON) and a limiter that wrote the response would
// have to know which one it was in.

const buckets = new Map();

/** The caller's address. On Vercel the first x-forwarded-for entry is the client. */
export function clientIp(req) {
  return (
    String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

function inMemory(id, limit, windowMs, now) {
  const bucket = buckets.get(id);
  if (!bucket || now > bucket.reset) {
    buckets.set(id, { count: 1, reset: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= limit;
}

async function viaUpstash(url, token, id, limit, windowMs) {
  const r = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([
      ['INCR', id],
      ['PEXPIRE', id, String(windowMs), 'NX'],
    ]),
  });
  if (!r.ok) throw new Error(`upstash ${r.status}`);
  const data = await r.json();
  return Number(data?.[0]?.result || 0) <= limit;
}

/**
 * Build a limiter for one endpoint.
 *
 * @returns {(req) => Promise<boolean>} true if this request may proceed.
 */
export function makeLimiter({ key, limit, windowMs, env = process.env, now = () => Date.now() }) {
  return async (req) => {
    const id = `platform:rl:${key}:${clientIp(req)}`;
    const url = env.UPSTASH_REDIS_REST_URL;
    const token = env.UPSTASH_REDIS_REST_TOKEN;

    if (url && token) {
      try {
        return await viaUpstash(url, token, id, limit, windowMs);
      } catch {
        // The shared store is down. Fall back to counting locally rather than
        // either blocking everybody or letting everybody through.
      }
    }
    return inMemory(id, limit, windowMs, now());
  };
}

/** Forget every in-memory count. Tests only. */
export function resetLimits() {
  buckets.clear();
}
