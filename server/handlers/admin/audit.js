// GET /api/admin/audit -> recent staff actions (audit trail). Owner/Manager.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, ok, serverError } from '../../lib/http.js';
import { requireRole } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;
  if (!requireRole(req, res, ['owner', 'manager'])) return;
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) return serverError(res, error.message);
    return ok(res, { entries: data || [] });
  } catch (err) {
    console.error('audit view error:', err.message);
    return serverError(res, 'Could not load audit log');
  }
}
