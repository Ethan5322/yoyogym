// Frontend API client. The browser ONLY talks to our /api serverless
// functions — never directly to Supabase (POPIA architecture, spec 6.3).
//
// THE SESSION IS AN HttpOnly COOKIE (CLAUDE.md §46.1 Q1), set by the server at
// sign-in and sent by the browser by itself. This page never sees it, so no
// script that ever runs here can copy it. Every request says it comes from a
// Yoyo Gyms page (X-Yoyo-Request); the server refuses a cookie-borne change
// without it — the defence against another site acting with this session.

import { currentGymSlug } from './gym.js';

/**
 * Where this gym's session is kept.
 *
 * ONE PER GYM. Every gym is served from the same origin, so a single fixed key
 * meant one session for the whole platform: signing in to gym B signed you
 * out of gym A, and a trainer working at two gyms could never have both open.
 * Single-gym mode keeps the original key, so an existing deployment's
 * sessions are exactly where they always were.
 */
export function tokenKey(base, gym = currentGymSlug()) {
  return gym ? `${base}:${gym}` : base;
}

/** Sent with every request: "this comes from a Yoyo Gyms page". */
export const PAGE_HEADERS = { 'X-Yoyo-Request': '1' };

/**
 * Sessions from before the cookie (CLAUDE.md §46.1 Q1) are removed from this
 * browser's storage: no longer used, and exactly what the change is for — a
 * token that any script on the page could read.
 */
export function forgetStoredSessions() {
  try {
    for (const k of Object.keys(localStorage)) {
      if (/^gym_(admin|member)_token(:|$)/.test(k)) localStorage.removeItem(k);
    }
  } catch {
    /* storage refused: nothing was kept there either */
  }
}
forgetStoredSessions();

/**
 * Make a JSON request to an /api endpoint.
 * Throws an Error with a friendly `.message` on non-2xx responses.
 */
export async function apiFetch(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json', ...PAGE_HEADERS };

  // WHICH GYM. Sent on every request so the server can resolve the tenant;
  // omitted entirely in single-gym mode, which is what an existing deployment
  // does and why nothing there changes.
  //
  // It is a hint, not a credential. For an authenticated request the server
  // takes the gym from the SIGNED TOKEN and refuses a header that disagrees
  // with it, so editing this value reaches nobody else's data — at worst it
  // produces an error. See server/lib/gymcontext.js.
  const gym = currentGymSlug();
  if (gym) headers['X-Gym-Slug'] = gym;

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // non-JSON response
  }

  if (!res.ok) {
    const message = (data && data.error) || `Request failed (${res.status})`;

    // NOT IN THIS GYM'S PLAN. Announced once, here, so one notice can offer
    // the upgrade for every screen — rather than each of 23 screens showing
    // "Request failed (402)" in its own red box. Still thrown below, so a
    // screen's own handling is unchanged.
    if (res.status === 402 && data?.feature && typeof window !== 'undefined') {
      window.dispatchEvent?.(new CustomEvent('yoyo:upgrade', { detail: { feature: data.feature, message } }));
    }

    const error = new Error(message);
    error.status = res.status;
    throw error;
  }
  return data;
}
