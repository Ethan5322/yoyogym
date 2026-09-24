// Frontend API client. The browser ONLY talks to our /api serverless
// functions — never directly to Supabase (POPIA architecture, spec 6.3).
//
// Attaches the admin JWT (when present) and normalises error handling.

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

const ADMIN_TOKEN = 'gym_admin_token';

export function getToken() {
  return localStorage.getItem(tokenKey(ADMIN_TOKEN));
}
export function setToken(token) {
  if (token) localStorage.setItem(tokenKey(ADMIN_TOKEN), token);
}
export function clearToken() {
  localStorage.removeItem(tokenKey(ADMIN_TOKEN));
}

/**
 * Make a JSON request to an /api endpoint.
 * Throws an Error with a friendly `.message` on non-2xx responses.
 */
export async function apiFetch(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

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
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // non-JSON response
  }

  if (!res.ok) {
    const message = (data && data.error) || `Request failed (${res.status})`;
    const error = new Error(message);
    error.status = res.status;
    throw error;
  }
  return data;
}
