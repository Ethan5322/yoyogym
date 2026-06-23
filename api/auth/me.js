// GET /api/auth/me -> { user }
// Validates the current session token and returns the live admin record.
// Used by the frontend on load to restore the session and confirm the
// account is still active.
import { getSupabase } from '../_lib/supabase.js';
import { authenticate } from '../_lib/auth.js';
import { allowMethods, ok, unauthorized, serverError } from '../_lib/http.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;

  const payload = authenticate(req, res);
  if (!payload) return;

  try {
    const supabase = getSupabase();
    const { data: user, error } = await supabase
      .from('admin_users')
      .select('id, username, full_name, email, role, trainer_id, is_active')
      .eq('id', payload.sub)
      .maybeSingle();

    if (error) return serverError(res, 'Could not load session');
    if (!user || !user.is_active) {
      return unauthorized(res, 'Session no longer valid');
    }

    return ok(res, { user });
  } catch (err) {
    console.error('me error:', err.message);
    return serverError(res, 'Could not load session');
  }
}
