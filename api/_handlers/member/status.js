// GET /api/member/status -> the member's membership status, expiry, session
// balance, and any outstanding payment (spec 2.4 E/F).
import { getSupabase } from '../../_lib/supabase.js';
import { allowMethods, ok, serverError } from '../../_lib/http.js';
import { authenticateMember } from '../../_lib/memberauth.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;
  const auth = authenticateMember(req, res);
  if (!auth) return;

  try {
    const supabase = getSupabase();
    const [{ data: member }, { data: membership }, { data: pendingPayments }] = await Promise.all([
      supabase
        .from('members')
        .select('full_name, membership_number, verification_code, status, parq_flag')
        .eq('id', auth.sub)
        .maybeSingle(),
      supabase
        .from('memberships')
        .select('visit_type, tier, contract_duration, state, start_date, end_date, sessions_total, sessions_remaining, next_billing_date, monthly_amount, plans(name)')
        .eq('member_id', auth.sub)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('payments')
        .select('amount, status, description')
        .eq('member_id', auth.sub)
        .in('status', ['pending', 'failed']),
    ]);

    const outstanding = (pendingPayments || []).reduce((s, p) => s + Number(p.amount || 0), 0);

    return ok(res, {
      member,
      membership: membership ? { ...membership, plan_name: membership.plans?.name } : null,
      outstanding_balance: outstanding,
      has_outstanding: outstanding > 0,
    });
  } catch (err) {
    console.error('member status error:', err.message);
    return serverError(res, 'Could not load status');
  }
}
