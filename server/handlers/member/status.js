// GET /api/member/status -> the member's membership status, expiry, session
// balance, and any outstanding payment (spec 2.4 E/F).
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, ok, serverError } from '../../lib/http.js';
import { authenticateMember } from '../../lib/memberauth.js';
import { loadCompliance, expectedVisits, adherence } from '../../lib/compliance.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;
  const auth = authenticateMember(req, res);
  if (!auth) return;

  try {
    const supabase = getSupabase();
    const since30 = new Date(Date.now() - 30 * 86400000);
    const [{ data: member }, { data: membership }, { data: pendingPayments }, { count: visits30 }, config] =
      await Promise.all([
        supabase
          .from('members')
          .select('full_name, membership_number, verification_code, status, parq_flag, training_frequency, photo_url')
          .eq('id', auth.sub)
          .maybeSingle(),
        supabase
          .from('memberships')
          .select('visit_type, tier, contract_duration, state, start_date, end_date, sessions_total, sessions_remaining, next_billing_date, monthly_amount, plans(name)')
          .eq('member_id', auth.sub)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from('payments').select('amount, status').eq('member_id', auth.sub).in('status', ['pending', 'failed']),
        supabase.from('checkins').select('id', { count: 'exact', head: true }).eq('member_id', auth.sub).gte('checked_in_at', since30.toISOString()),
        loadCompliance(supabase),
      ]);

    const outstanding = (pendingPayments || []).reduce((s, p) => s + Number(p.amount || 0), 0);
    const expected = expectedVisits(config, member?.training_frequency, 30);
    const score = adherence(config, visits30 || 0, expected);

    return ok(res, {
      member,
      membership: membership ? { ...membership, plan_name: membership.plans?.name } : null,
      outstanding_balance: outstanding,
      has_outstanding: outstanding > 0,
      adherence: { ...score, visits_30d: visits30 || 0, expected_30d: expected },
    });
  } catch (err) {
    console.error('member status error:', err.message);
    return serverError(res, 'Could not load status');
  }
}
