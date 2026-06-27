// GET /api/admin/audit -> staff actions (audit trail). Owner/Manager.
//   Query: q (actor/action/detail search), action (prefix, e.g. "payment"),
//          from, to (ISO dates), limit
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, ok, serverError } from '../../lib/http.js';
import { requireRole } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;
  if (!requireRole(req, res, ['owner', 'manager'])) return;
  try {
    const url = new URL(req.url, 'http://localhost');
    const q = (url.searchParams.get('q') || '').replace(/[%,]/g, '').trim();
    const action = (url.searchParams.get('action') || '').trim(); // prefix
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const limit = Math.min(500, parseInt(url.searchParams.get('limit') || '200', 10));

    const supabase = getSupabase();
    let query = supabase
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (q) query = query.or(`admin_name.ilike.%${q}%,action.ilike.%${q}%,detail.ilike.%${q}%,entity.ilike.%${q}%`);
    if (action) query = query.ilike('action', `${action}%`);
    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to);

    const { data, error } = await query;
    if (error) return serverError(res, error.message);
    return ok(res, { entries: data || [] });
  } catch (err) {
    console.error('audit view error:', err.message);
    return serverError(res, 'Could not load audit log');
  }
}
