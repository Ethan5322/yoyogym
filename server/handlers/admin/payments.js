// Payments & financial management (spec 4.9). Owner/Manager.
//   GET   /api/admin/payments?status=&category=&from=&to=  list + breakdown
//   POST  /api/admin/payments                              record manual (cash/EFT) payment
//   PATCH /api/admin/payments?id=...                       record refund
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError } from '../../lib/http.js';
import { requireRole } from '../../lib/auth.js';
import { recordAudit } from '../../lib/audit.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST', 'PATCH'])) return;
  const admin = requireRole(req, res, ['owner', 'manager']);
  if (!admin) return;

  const supabase = getSupabase();
  const url = new URL(req.url, 'http://localhost');

  try {
    if (req.method === 'POST') {
      const b = await readJsonBody(req);
      if (!b.amount || !b.category) return badRequest(res, 'amount and category are required.');
      const { error } = await supabase.from('payments').insert({
        member_id: b.member_id || null,
        membership_id: b.membership_id || null,
        category: b.category,
        amount: b.amount,
        status: 'received',
        method: b.method || 'cash',
        description: b.description || 'Manual payment',
        paid_at: new Date().toISOString(),
      });
      if (error) return serverError(res, error.message);
      await recordAudit(supabase, admin, { action: 'payment.manual', entity: 'payment', entity_id: b.member_id, detail: `${b.category} R${b.amount} (${b.method || 'cash'})` });
      return ok(res, { recorded: true });
    }

    if (req.method === 'PATCH') {
      const id = url.searchParams.get('id');
      if (!id) return badRequest(res, 'id is required.');
      const b = await readJsonBody(req);
      const { error } = await supabase
        .from('payments')
        .update({ status: 'refunded', refunded_amount: b.refunded_amount || 0, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) return serverError(res, error.message);
      await recordAudit(supabase, admin, { action: 'payment.refund', entity: 'payment', entity_id: id, detail: `R${b.refunded_amount || 0}` });
      return ok(res, { refunded: true });
    }

    // GET list + breakdown
    const status = url.searchParams.get('status');
    const category = url.searchParams.get('category');
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');

    let q = supabase
      .from('payments')
      .select('*, members(full_name, membership_number)')
      .order('created_at', { ascending: false })
      .limit(200);
    if (status) q = q.eq('status', status);
    if (category) q = q.eq('category', category);
    if (from) q = q.gte('created_at', from);
    if (to) q = q.lte('created_at', to);

    const { data, error } = await q;
    if (error) return serverError(res, error.message);

    // Revenue breakdown by category (received only).
    const breakdown = {};
    let totalReceived = 0;
    for (const p of data || []) {
      if (p.status === 'received') {
        breakdown[p.category] = (breakdown[p.category] || 0) + Number(p.amount || 0);
        totalReceived += Number(p.amount || 0);
      }
    }

    return ok(res, {
      payments: (data || []).map((p) => ({
        id: p.id,
        member_name: p.members?.full_name || '—',
        membership_number: p.members?.membership_number || '',
        category: p.category,
        amount: Number(p.amount),
        status: p.status,
        method: p.method,
        description: p.description,
        created_at: p.created_at,
      })),
      breakdown,
      total_received: totalReceived,
    });
  } catch (err) {
    console.error('payments admin error:', err.message);
    return serverError(res, 'Payments operation failed');
  }
}
