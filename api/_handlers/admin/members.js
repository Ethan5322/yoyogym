// GET /api/admin/members -> searchable, filterable member list (spec 4.4).
// Query params: q, status, tier, parq ("1"), page, page_size. Owner/Manager.
import { getSupabase } from '../../_lib/supabase.js';
import { allowMethods, ok, serverError } from '../../_lib/http.js';
import { requireRole } from '../../_lib/auth.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;
  if (!requireRole(req, res, ['owner', 'manager'])) return;

  try {
    const url = new URL(req.url, 'http://localhost');
    const q = (url.searchParams.get('q') || '').replace(/[%,]/g, '').trim();
    const status = url.searchParams.get('status');
    const parq = url.searchParams.get('parq');
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const pageSize = Math.min(50, parseInt(url.searchParams.get('page_size') || '20', 10));
    const from = (page - 1) * pageSize;

    const supabase = getSupabase();
    let query = supabase
      .from('members')
      .select('id, full_name, membership_number, phone, email, status, parq_flag, created_at', {
        count: 'exact',
      })
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);

    if (q) {
      query = query.or(
        `full_name.ilike.%${q}%,membership_number.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%,id_number.ilike.%${q}%`
      );
    }
    if (status) query = query.eq('status', status);
    if (parq === '1') query = query.eq('parq_flag', true);

    const { data, count, error } = await query;
    if (error) return serverError(res, error.message);

    return ok(res, {
      members: data || [],
      total: count || 0,
      page,
      page_size: pageSize,
      pages: Math.ceil((count || 0) / pageSize),
    });
  } catch (err) {
    console.error('members error:', err.message);
    return serverError(res, 'Could not load members');
  }
}
