// POST /api/member/pay  { callback_url }  -> { authorization_url, reference, amount }
// Lets a signed-in member settle an outstanding balance (a pending or failed
// payment) via Paystack. Returns the URL to redirect the member to; the
// existing /payment/callback flow verifies and activates on return.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError, json } from '../../lib/http.js';
import { authenticateMember } from '../../lib/memberauth.js';
import { paystackConfigured, initializeTransaction, newReference } from '../../lib/paystack.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  const auth = authenticateMember(req, res);
  if (!auth) return;

  if (!paystackConfigured()) {
    return json(res, 503, { error: 'Online payment is not available right now. Please pay at reception.' });
  }

  try {
    const { callback_url } = await readJsonBody(req);
    const supabase = getSupabase();

    const { data: member } = await supabase
      .from('members')
      .select('id, email, full_name')
      .eq('id', auth.sub)
      .maybeSingle();
    if (!member) return badRequest(res, 'Member not found.');

    // Oldest unsettled payment (pending or failed).
    const { data: payment } = await supabase
      .from('payments')
      .select('id, amount')
      .eq('member_id', auth.sub)
      .in('status', ['pending', 'failed'])
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!payment) return badRequest(res, 'You have no outstanding balance. 🎉');

    const reference = newReference('MBR');
    const data = await initializeTransaction({
      email: member.email,
      amount: payment.amount,
      reference,
      callback_url,
      metadata: { member_id: member.id, payment_id: payment.id, full_name: member.full_name },
    });

    // Re-arm the payment for this attempt.
    await supabase
      .from('payments')
      .update({ status: 'pending', paystack_reference: reference, updated_at: new Date().toISOString() })
      .eq('id', payment.id);

    return ok(res, { authorization_url: data.authorization_url, reference, amount: payment.amount });
  } catch (err) {
    console.error('member pay error:', err.message);
    return serverError(res, err.message || 'Could not start payment.');
  }
}
