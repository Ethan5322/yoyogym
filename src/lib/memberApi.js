// Member-portal API client (separate token from admin). The browser only ever
// talks to /api functions, never Supabase directly.
const TOKEN_KEY = 'gym_member_token';

export const getMemberToken = () => localStorage.getItem(TOKEN_KEY);
export const setMemberToken = (t) => t && localStorage.setItem(TOKEN_KEY, t);
export const clearMemberToken = () => localStorage.removeItem(TOKEN_KEY);

export async function memberFetch(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
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
