// POST /api/auth/change-password  { current_password, new_password }
// Any signed-in admin can change THEIR OWN password. Verifies the current
// password, then stores a new bcrypt hash. (RBAC: any authenticated role.)
import { getSupabase } from '../../lib/supabase.js';
import { authenticate, verifyPassword, hashPassword } from '../../lib/auth.js';
import { allowMethods, readJsonBody, ok, badRequest, unauthorized, serverError } from '../../lib/http.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  const admin = authenticate(req, res);
  if (!admin) return;

  try {
    const { current_password, new_password } = await readJsonBody(req);
    if (!current_password || !new_password) {
      return badRequest(res, 'Current and new password are required.');
    }
    if (String(new_password).length < 8) {
      return badRequest(res, 'New password must be at least 8 characters.');
    }

    const supabase = getSupabase();
    const { data: user, error } = await supabase
      .from('admin_users')
      .select('id, password_hash')
      .eq('id', admin.sub)
      .maybeSingle();
    if (error) return serverError(res, 'Could not update password.');
    if (!user) return unauthorized(res, 'Account not found.');

    const valid = await verifyPassword(current_password, user.password_hash);
    if (!valid) return badRequest(res, 'Your current password is incorrect.');

    const password_hash = await hashPassword(new_password);
    const { error: upErr } = await supabase
      .from('admin_users')
      .update({ password_hash, updated_at: new Date().toISOString() })
      .eq('id', admin.sub);
    if (upErr) return serverError(res, 'Could not update password.');

    return ok(res, { message: 'Password updated. Use it next time you sign in.' });
  } catch (err) {
    console.error('change-password error:', err.message);
    return serverError(res, 'Could not update password.');
  }
}
