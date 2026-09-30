// Member-portal API client. The browser only ever talks to /api functions,
// never Supabase directly.
//
// THE SESSION IS AN HttpOnly COOKIE (CLAUDE.md §46.1 Q1), one per gym, set by
// the server at sign-in — never kept where a script on the page could read
// it. See src/lib/api.js.
import { gymHeaders } from './gym.js';
import { PAGE_HEADERS } from './api.js';

export async function memberFetch(path, { method = 'GET', body } = {}) {
  // WHICH GYM — see gymHeaders(). Missing here, a member at /g/<slug>/member
  // signed in against the default schema: another gym's members.
  const headers = { 'Content-Type': 'application/json', ...PAGE_HEADERS, ...gymHeaders() };
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
    /* non-JSON */
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/** Sign out of this gym's member area on this browser: only the server can. */
export function memberSignOut() {
  return memberFetch('/member/logout', { method: 'POST' }).catch(() => {});
}
