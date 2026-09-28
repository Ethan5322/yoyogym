// POST /api/auth/login  { username, password } -> { token, user }
// (`username` may also be the account's email — see findAdminAccount.)
//
// Custom admin authentication (spec Part 4.1):
// - bcrypt password verification
// - 8-hour JWT session
// - failed login attempts logged; account locked after repeated failures
import { getSupabase } from '../../lib/supabase.js';
import { verifyPassword, signToken } from '../../lib/auth.js';
import { allowMethods, readJsonBody, ok, badRequest, unauthorized, serverError } from '../../lib/http.js';
import { rateLimit } from '../../lib/ratelimit.js';
import { currentGym } from '../../lib/tenancy.js';

// The gym this login happened in, stamped into the token so every later
// request carries it in a signature the client cannot edit. null in
// single-gym mode, which leaves the token exactly as it was before.
const gymSlug = () => currentGym()?.gym?.slug ?? null;

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

/**
 * The account a sign-in names: by USERNAME first, exactly as it always was,
 * then — only if nothing matched and it looks like one — by EMAIL (CLAUDE.md
 * §36.1 Q12, approved by the user 2026-09-28: owners typed their email and
 * were refused).
 *
 * The email match is exact and case-insensitive, compared here rather than
 * with a database pattern, so `%` or `_` in the box can never widen it. And it
 * counts only when EXACTLY ONE account has that email: two staff sharing an
 * address must use their usernames, because guessing between them would sign
 * someone into the wrong account.
 *
 * @returns {Promise<{user: object|null, error?: object}>}
 */
export async function findAdminAccount(supabase, identifier) {
  const { data: byName, error } = await supabase
    .from('admin_users')
    .select('*')
    .eq('username', identifier)
    .maybeSingle();
  if (error) return { user: null, error };
  if (byName) return { user: byName };

  const email = String(identifier || '').trim().toLowerCase();
  if (!email.includes('@')) return { user: null };

  const { data: rows, error: listError } = await supabase
    .from('admin_users')
    .select('id, email')
    .not('email', 'is', null);
  if (listError) return { user: null, error: listError };

  const matches = (rows || []).filter((r) => String(r.email || '').trim().toLowerCase() === email);
  if (matches.length !== 1) return { user: null };

  const { data: user, error: rowError } = await supabase
    .from('admin_users')
    .select('*')
    .eq('id', matches[0].id)
    .maybeSingle();
  return rowError ? { user: null, error: rowError } : { user: user || null };
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  if (!(await rateLimit(req, res, { key: 'admin-login', limit: 10, windowMs: 60_000 }))) return;

  try {
    const { username, password } = await readJsonBody(req);
    if (!username || !password) {
      return badRequest(res, 'Username and password are required');
    }

    const supabase = getSupabase();
    // Username, or the account's email (see findAdminAccount).
    const { user, error } = await findAdminAccount(supabase, username);

    if (error) return serverError(res, 'Login failed');

    // Generic message — never reveal whether the username exists.
    const INVALID = 'Invalid username or password';
    if (!user) return unauthorized(res, INVALID);

    if (!user.is_active) {
      return unauthorized(res, 'This account is disabled. Contact the gym owner.');
    }

    // Locked out?
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return unauthorized(res, 'Account temporarily locked. Try again later.');
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      const attempts = (user.failed_logins || 0) + 1;
      const update = { failed_logins: attempts, updated_at: new Date().toISOString() };
      if (attempts >= MAX_FAILED_ATTEMPTS) {
        update.locked_until = new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString();
        update.failed_logins = 0;
      }
      await supabase.from('admin_users').update(update).eq('id', user.id);
      return unauthorized(res, INVALID);
    }

    // Success: reset counters, stamp last login.
    await supabase
      .from('admin_users')
      .update({
        failed_logins: 0,
        locked_until: null,
        last_login_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    const token = signToken(user, { gym: gymSlug() });
    return ok(res, {
      token,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        trainer_id: user.trainer_id,
      },
    });
  } catch (err) {
    console.error('login error:', err.message);
    return serverError(res, 'Login failed');
  }
}
