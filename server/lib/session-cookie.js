// Website sessions in HttpOnly cookies (CLAUDE.md §46.1 Q1).
//
// A session kept in localStorage can be read by any script that ever runs on
// the page — one injected script, and every signed-in session on that
// computer walks away. An HttpOnly cookie cannot be read by script at all. So
// the website's gym admin panel and member pages now keep their sessions in
// one. The store app keeps its Bearer token (from the phone's Keychain /
// Keystore), and the server accepts both.
//
// ONE COOKIE PER GYM AND SIDE, as localStorage had one key per gym: signing in
// to gym B does not sign you out of gym A. Named after the gym the PAGE asks
// for (its X-Gym-Slug header), exactly as the page's own key was.
//
// ADOPTED AT THE ROUTER: a request with a session cookie and no Authorization
// header is given the cookie's token as its Bearer. So every check after it —
// the gym stamped in the token (gymcontext.js), the long-session version
// (sessions.js), the role — runs unchanged, in one place, for both doors.
//
// CSRF: a browser attaches cookies to requests another site makes. So a
// cookie-borne session may only CHANGE something when the request also carries
// X-Yoyo-Request — a header a page on another site cannot add without this
// server's permission (CORS), which it gives to nobody but the store app. And
// a sign-in only SETS a cookie when that header is present, so another site
// cannot sign a visitor in to an account of its choosing. The cookies are
// SameSite=Lax as well: never sent with another site's POST.

const SAFE_SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** The header only the Yoyo Gyms pages send (src/lib/api.js, memberApi.js). */
export const PAGE_HEADER = 'x-yoyo-request';

/** 'admin' | 'member' → the cookie's name for this gym. */
export function cookieName(kind, slug = null) {
  const base = kind === 'member' ? 'yoyo_member' : 'yoyo_admin';
  return slug && SAFE_SLUG.test(slug) ? `${base}__${slug}` : base;
}

/** The gym the page asked for — the same hint its own storage key used. */
export function pageGym(req) {
  const raw = String(req.headers?.['x-gym-slug'] || '').trim().toLowerCase();
  return SAFE_SLUG.test(raw) ? raw : null;
}

export function readCookies(req) {
  const out = {};
  for (const part of String(req.headers?.cookie || '').split(';')) {
    const at = part.indexOf('=');
    if (at < 1) continue;
    out[part.slice(0, at).trim()] = part.slice(at + 1).trim();
  }
  return out;
}

/** Add a Set-Cookie without losing one already on the response. */
function addSetCookie(res, value) {
  const prev = typeof res.getHeader === 'function' ? res.getHeader('Set-Cookie') : undefined;
  res.setHeader('Set-Cookie', prev ? [].concat(prev, value) : [value]);
}

/** Seconds until the token's own expiry — the cookie never outlives the session. */
function secondsLeft(token) {
  try {
    const payload = JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8'));
    return Math.max(0, Math.floor(payload.exp - Date.now() / 1000));
  } catch {
    return 0;
  }
}

/**
 * After a sign-in: keep the session in an HttpOnly cookie — only when a Yoyo
 * Gyms page asked (PAGE_HEADER). The JSON answer still carries the token for
 * the store app, which keeps it in the phone's secure storage.
 * @param {object} [opts] { slug } — the gym to name it after; the page's gym by default
 */
export function issueSessionCookie(req, res, kind, token, { slug = pageGym(req) } = {}) {
  if (!req.headers?.[PAGE_HEADER] || !token) return false;
  const maxAge = secondsLeft(token);
  if (!maxAge) return false;
  addSetCookie(res, `${cookieName(kind, slug)}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`);
  return true;
}

/** Signing out of the website: the cookie cannot be removed by script, only here. */
export function clearSessionCookie(req, res, kind) {
  addSetCookie(res, `${cookieName(kind, pageGym(req))}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

/**
 * Adopt the page's session cookie as the request's Bearer, and refuse a
 * cookie-borne change that did not come from a Yoyo Gyms page.
 * @returns {boolean} true to carry on; false once it has answered 403.
 */
export function adoptSessionCookie(req, res, kind, json) {
  if (req.headers?.authorization) return true; // the store app, or any caller with its own token
  const token = readCookies(req)[cookieName(kind, pageGym(req))];
  if (!token) return true;
  if (!SAFE_METHODS.has(String(req.method || 'GET').toUpperCase()) && !req.headers?.[PAGE_HEADER]) {
    json(res, 403, { error: 'This request did not come from a Yoyo Gyms page.' });
    return false;
  }
  req.headers.authorization = `Bearer ${token}`;
  return true;
}
