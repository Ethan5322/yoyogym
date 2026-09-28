// "Stay signed in until you sign out" (CLAUDE.md §38.1 Q2, Q3).
//
// ============================================================================
// Two kinds of session, side by side
// ============================================================================
//
//   SHORT — what every session was before: a token that simply expires (12 h
//   for a member, 8 h for staff). Nothing here touches them: they carry no
//   `sv` claim and are checked exactly as before, with no database read.
//
//   LONG — issued only when the APP asks (`remember: true` at sign-in). It
//   lasts until the person signs out, so an expiry cannot be what ends it.
//   Instead it carries `sv`: the account's `session_version` when it was
//   issued. Every request with a long token is checked against the account's
//   CURRENT version, and raising that number signs the person out on every
//   phone at once — the gym's "lost phone" button, a staff member who left,
//   a password reset, a disabled account.
//
// The check lives in the three routers (api/member, api/admin, api/auth), one
// place each, like plan enforcement: no handler has to remember it.
import { getSupabase } from './supabase.js';
import { verifyMemberToken } from './memberauth.js';
import { verifyToken } from './auth.js';

export { REMEMBER_FOR } from './session-length.js';

/** What a long-session token must carry, and why a request is refused. */
export const SIGNED_OUT = 'You were signed out. Please sign in again.';

function bearer(req) {
  const [scheme, token] = String(req.headers?.authorization || '').split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

/**
 * Is this request's long session still valid? Returns true to carry on, or
 * responds 401 and returns false. Short sessions, anonymous requests and
 * tokens that fail to verify pass straight through: the handler's own
 * authentication decides those, exactly as before.
 *
 * @param {'member'|'admin'} kind
 * @param {object} [db]  injectable for tests; the gym's own client otherwise
 */
export async function checkLongSession(req, res, kind, json, db) {
  const token = bearer(req);
  if (!token) return true;

  const payload = kind === 'member' ? verifyMemberToken(token) : verifyToken(token);
  if (!payload || typeof payload.sv !== 'number') return true; // not a long session

  const supabase = db || getSupabase();
  const table = kind === 'member' ? 'members' : 'admin_users';
  const columns = kind === 'member' ? 'session_version' : 'session_version, is_active';
  const { data: row, error } = await supabase.from(table).select(columns).eq('id', payload.sub).maybeSingle();

  // A database failure is not a sign-out: the person is not punished for our
  // outage. The handler still authenticates the token as usual.
  if (error) return true;

  const valid =
    row &&
    Number(row.session_version || 0) === payload.sv &&
    (kind === 'member' || row.is_active !== false);
  if (valid) return true;

  json(res, 401, { error: SIGNED_OUT, signed_out: true });
  return false;
}

/**
 * Sign one person out on every phone: raise their session_version. Long
 * sessions issued before this stop working on their next request; short ones
 * run out on their own as they always have.
 */
export async function signOutEverywhere(supabase, kind, id) {
  const table = kind === 'member' ? 'members' : 'admin_users';
  const { data: row, error } = await supabase.from(table).select('session_version').eq('id', id).maybeSingle();
  if (error) return { ok: false, error };
  if (!row) return { ok: false, error: { message: 'Not found' } };
  const { error: e2 } = await supabase
    .from(table)
    .update({ session_version: Number(row.session_version || 0) + 1 })
    .eq('id', id);
  return e2 ? { ok: false, error: e2 } : { ok: true };
}

/**
 * The account with its current session_version attached, for signing a long
 * session. Only read when one is asked for, so a short sign-in costs nothing
 * extra. The face sign-ins select a fixed list of columns; this fills the gap.
 */
export async function withSessionVersion(supabase, table, account, remember) {
  if (remember !== true || account.session_version != null) return account;
  const { data } = await supabase.from(table).select('session_version').eq('id', account.id).maybeSingle();
  return { ...account, session_version: data?.session_version ?? 0 };
}
