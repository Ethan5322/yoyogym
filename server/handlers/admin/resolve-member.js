// GET /api/admin/resolve-member?membership_number=GYM-...  (QR scan-in helper)
// Resolves a scanned member QR (which carries the membership number) to an id.
// Owner/Manager/Reception.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, ok, badRequest, serverError } from '../../lib/http.js';
import { requireRole } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;
  if (!requireRole(req, res, ['owner', 'manager', 'reception'])) return;

  const num = new URL(req.url, 'http://localhost').searchParams.get('membership_number');
  if (!num) return badRequest(res, 'membership_number is required.');

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('members')
      .select('id')
      .eq('membership_number', num.trim().toUpperCase())
      .maybeSingle();
    if (error) return serverError(res, error.message);
    if (!data) return ok(res, { found: false });
    return ok(res, { found: true, id: data.id });
  } catch (err) {
    console.error('resolve-member error:', err.message);
    return serverError(res, 'Lookup failed');
  }
}
