// Payments & financial management (spec 4.9). Owner/Manager.
//   GET   /api/admin/payments?status=&category=&from=&to=  list + breakdown
//   POST  /api/admin/payments                              record manual (cash/EFT) payment
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError } from '../../lib/http.js';
import { requireRole } from '../../lib/auth.js';
import { recordAudit } from '../../lib/audit.js';
import { activateForPayment } from '../../lib/activation.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;
  const admin = requireRole(req, res, ['owner', 'manager']);
  if (!admin) return;

  const supabase = getSupabase();
  const url = new URL(req.url, 'http://localhost');

  try {
    if (req.method === 'POST') {
      const b = await readJsonBody(req);
      if (!b.amount || !b.category) return badRequest(res, 'amount and category are required.');
      const { data: payment, error } = await supabase
        .from('payments')
        .insert({
          member_id: b.member_id || null,
          membership_id: b.membership_id || null,
          category: b.category,
          amount: b.amount,
          status: 'received',
          method: b.method || 'cash',
          description: b.description || 'Manual payment',
          paid_at: new Date().toISOString(),
        })
        .select('id, member_id, membership_id, amount, description')
        .single();
      if (error) return serverError(res, error.message);

      // Recording a payment is what activates the member (spec: members pay the
      // gym directly; capture is the activation event).
      const { activated, error: activationError } = await activateForPayment(supabase, payment);

      await recordAudit(supabase, admin, {
        action: 'payment.manual',
        entity: 'payment',
        entity_id: b.member_id,
        detail: `${b.category} R${b.amount} (${b.method || 'cash'})${activated ? ' — member activated' : ''}`,
      });

      // The payment IS recorded even if activation failed; say so plainly
      // rather than reporting a clean success.
      return ok(res, { recorded: true, activated, activation_error: activationError || null });
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
