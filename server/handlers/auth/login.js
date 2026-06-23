// POST /api/auth/login  { username, password } -> { token, user }
//
// Custom admin authentication (spec Part 4.1):
// - bcrypt password verification
// - 8-hour JWT session
// - failed login attempts logged; account locked after repeated failures
import { getSupabase } from '../../lib/supabase.js';
import { verifyPassword, signToken } from '../../lib/auth.js';
import { allowMethods, readJsonBody, ok, badRequest, unauthorized, serverError } from '../../lib/http.js';
import { rateLimit } from '../../lib/ratelimit.js';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  if (!rateLimit(req, res, { key: 'admin-login', limit: 10, windowMs: 60_000 })) return;

  try {
    const { username, password } = await readJsonBody(req);
    if (!username || !password) {
      return badRequest(res, 'Username and password are required');
    }

    const supabase = getSupabase();
    const { data: user, error } = await supabase
      .from('admin_users')
      .select('*')
      .eq('username', username)
      .maybeSingle();

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

    const token = signToken(user);
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
