// Letting the Yoyo Gyms app talk to its own server.
//
// ============================================================================
// Why this exists
// ============================================================================
//
// The app's own screens are not served by yoyogym.vercel.app. Capacitor serves
// them from inside the phone, at
//
//     https://localhost        (Android)
//     capacitor://localhost    (iPhone)
//
// so every call the app makes to the server is CROSS-ORIGIN, and a WebView
// enforces CORS exactly as a browser does. There were no CORS headers anywhere
// in this system, so the app's gym search and its "which gym did I join?"
// lookup were blocked by the WebView on a real phone. The reply arrived and
// the app was not allowed to read it.
//
// ============================================================================
// Why allowing these origins is safe
// ============================================================================
//
// 1. Only the JSON APIs call this. The staff panel's cookie-authenticated
//    pages never do.
// 2. Access-Control-Allow-Credentials is NEVER sent, so a browser attaches no
//    cookies to a cross-origin request. Everything the app does is
//    authenticated by a Bearer token it attaches deliberately. There is no
//    ambient credential for another origin to borrow.
// 3. The origin is echoed only when it is on the list. Anything else gets no
//    CORS headers at all, and is blocked as it always was.

/** Where Capacitor serves the app from. Nothing else is allowed. */
export const APP_ORIGINS = Object.freeze(['https://localhost', 'capacitor://localhost']);

const ALLOW_HEADERS = 'Authorization, Content-Type, X-Gym-Slug';
const ALLOW_METHODS = 'GET, POST, PATCH, DELETE, OPTIONS';

/**
 * Add CORS headers for the app, and answer its preflight.
 *
 * Works with both response styles in this codebase (Node's and Vercel's),
 * because it only uses setHeader, statusCode and end.
 *
 * @returns {boolean} true when this was a preflight and has been answered.
 *   The caller returns straight away.
 */
export function applyAppCors(req, res) {
  const origin = String(req.headers?.origin || '');

  // Tells caches that this response depends on the Origin header. Without
  // it, a CDN could hand the app's CORS-enabled reply to someone else, or
  // the reverse.
  res.setHeader('Vary', 'Origin');

  if (!APP_ORIGINS.includes(origin)) return false;

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Headers', ALLOW_HEADERS);
  res.setHeader('Access-Control-Allow-Methods', ALLOW_METHODS);
  res.setHeader('Access-Control-Max-Age', '600');

  if (String(req.method || '').toUpperCase() === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}
