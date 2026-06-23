// POST /api/payments/initialize  { member_id, callback_url }
//   -> { authorization_url, reference }
//
// Starts a Paystack transaction for the member's outstanding pending payment
// (the joining fee + first month, or pack/day/trial amount created at
// registration). The frontend redirects the client to authorization_url.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError, json } from '../../lib/http.js';
import { paystackConfigured, initializeTransaction, newReference } from '../../lib/paystack.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  if (!paystackConfigured()) {
    return json(res, 503, { error: 'Online payment is not configured yet. Please pay at reception.' });
  }

  try {
    const { member_id, callback_url } = await readJsonBody(req);
    if (!member_id) return badRequest(res, 'member_id is required.');

    const supabase = getSupabase();

    const { data: member, error: mErr } = await supabase
      .from('members')
      .select('id, email, full_name')
      .eq('id', member_id)
      .maybeSingle();
    if (mErr) return serverError(res, mErr.message);
    if (!member) return badRequest(res, 'Member not found.');

    // Most recent pending payment for this member.
    const { data: payment, error: pErr } = await supabase
      .from('payments')
      .select('*')
      .eq('member_id', member_id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (pErr) return serverError(res, pErr.message);
    if (!payment) return badRequest(res, 'No pending payment found for this member.');

    const reference = newReference();
    const data = await initializeTransaction({
      email: member.email,
      amount: payment.amount,
      reference,
      callback_url,
      metadata: { member_id: member.id, payment_id: payment.id, full_name: member.full_name },
    });

    await supabase
      .from('payments')
      .update({ paystack_reference: reference, updated_at: new Date().toISOString() })
      .eq('id', payment.id);

    return ok(res, { authorization_url: data.authorization_url, reference, amount: payment.amount });
  } catch (err) {
    console.error('initialize error:', err.message);
    return serverError(res, err.message || 'Could not start payment');
  }
}
