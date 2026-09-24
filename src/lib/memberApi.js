// Member-portal API client (separate token from admin). The browser only ever
// talks to /api functions, never Supabase directly.
import { gymHeaders } from './gym.js';
import { tokenKey } from './api.js';

// One session per gym — see tokenKey() in api.js.
const MEMBER_TOKEN = 'gym_member_token';

export const getMemberToken = () => localStorage.getItem(tokenKey(MEMBER_TOKEN));
export const setMemberToken = (t) => t && localStorage.setItem(tokenKey(MEMBER_TOKEN), t);
export const clearMemberToken = () => localStorage.removeItem(tokenKey(MEMBER_TOKEN));

export async function memberFetch(path, { method = 'GET', body, auth = true } = {}) {
  // WHICH GYM — see gymHeaders(). Missing here, a member at /g/<slug>/member
  // signed in against the default schema: another gym's members.
  const headers = { 'Content-Type': 'application/json', ...gymHeaders() };
  if (auth) {
    const t = getMemberToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}
