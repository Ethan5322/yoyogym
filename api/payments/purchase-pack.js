// POST /api/payments/purchase-pack  { member_id, plan_id, callback_url }
//   -> { authorization_url, reference }
//
// Session pack purchase flow (spec Phase 3 #15). Lets an existing member buy
// another session pack: creates a new membership row + a pending payment, then
// starts a Paystack transaction. The pack's sessions become available once the
// payment is confirmed (activation marks the membership active).
import { getSupabase } from '../_lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError, json } from '../_lib/http.js';
import { paystackConfigured, initializeTransaction, newReference } from '../_lib/paystack.js';
import { computeMembership } from '../../shared/pricing.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  if (!paystackConfigured()) {
    return json(res, 503, { error: 'Online payment is not configured yet. Please pay at reception.' });
  }

  try {
    const { member_id, plan_id, callback_url } = await readJsonBody(req);
    if (!member_id || !plan_id) return badRequest(res, 'member_id and plan_id are required.');

    const supabase = getSupabase();

    const { data: member, error: mErr } = await supabase
      .from('members')
      .select('id, email, full_name')
      .eq('id', member_id)
      .maybeSingle();
    if (mErr) return serverError(res, mErr.message);
    if (!member) return badRequest(res, 'Member not found.');

    const { data: plan, error: pErr } = await supabase
      .from('plans')
      .select('*')
      .eq('id', plan_id)
      .eq('is_enabled', true)
      .maybeSingle();
    if (pErr) return serverError(res, pErr.message);
    if (!plan || plan.visit_type !== 'session_pack') {
      return badRequest(res, 'Selected plan is not an available session pack.');
    }

    const m = computeMembership(plan, null);

    const { data: membershipRow, error: insErr } = await supabase
      .from('memberships')
      .insert({
        member_id: member.id,
        plan_id: plan.id,
        visit_type: 'session_pack',
        state: 'active',
        start_date: new Date().toISOString().slice(0, 10),
        sessions_total: m.sessions_total,
        sessions_remaining: m.sessions_total,
      })
      .select('id')
      .single();
    if (insErr) return serverError(res, insErr.message);

    const { data: payment, error: payErr } = await supabase
      .from('payments')
      .insert({
        member_id: member.id,
        membership_id: membershipRow.id,
        category: 'session_pack',
        amount: m.amount_today,
        currency: 'ZAR',
        status: 'pending',
        description: `${plan.name} purchase`,
      })
      .select('id')
      .single();
    if (payErr) return serverError(res, payErr.message);

    const reference = newReference('PACK');
    const data = await initializeTransaction({
      email: member.email,
      amount: m.amount_today,
      reference,
      callback_url,
      metadata: { member_id: member.id, payment_id: payment.id, type: 'session_pack' },
    });

    await supabase
      .from('payments')
      .update({ paystack_reference: reference, updated_at: new Date().toISOString() })
      .eq('id', payment.id);

    return ok(res, { authorization_url: data.authorization_url, reference, amount: m.amount_today });
  } catch (err) {
    console.error('purchase-pack error:', err.message);
    return serverError(res, err.message || 'Could not start pack purchase');
  }
}
