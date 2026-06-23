// POST /api/payments/verify  { reference }  -> { status, member }
//
// Called by the payment callback page after Paystack redirects back. Verifies
// the transaction directly with Paystack (authoritative), activates the
// membership on success, and returns the data the success screen needs.
import { getSupabase } from '../_lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError } from '../_lib/http.js';
import { paystackConfigured, verifyTransaction } from '../_lib/paystack.js';
import { activatePayment } from '../_lib/activation.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  if (!paystackConfigured()) return serverError(res, 'Paystack is not configured.');

  try {
    const { reference } = await readJsonBody(req);
    if (!reference) return badRequest(res, 'reference is required.');

    const supabase = getSupabase();
    const { data: payment, error: pErr } = await supabase
      .from('payments')
      .select('*')
      .eq('paystack_reference', reference)
      .maybeSingle();
    if (pErr) return serverError(res, pErr.message);
    if (!payment) return badRequest(res, 'Unknown payment reference.');

    const data = await verifyTransaction(reference);

    if (data.status !== 'success') {
      if (payment.status === 'pending') {
        await supabase
          .from('payments')
          .update({ status: 'failed', updated_at: new Date().toISOString() })
          .eq('id', payment.id);
      }
      return ok(res, { status: data.status || 'failed' });
    }

    await activatePayment(supabase, payment, data);

    // Gather success-screen data (we may have lost client state on redirect).
    const { data: member } = await supabase
      .from('members')
      .select('full_name, membership_number, verification_code, parq_flag')
      .eq('id', payment.member_id)
      .maybeSingle();
    const { data: membership } = await supabase
      .from('memberships')
      .select('monthly_amount, contract_duration, plans(name)')
      .eq('id', payment.membership_id)
      .maybeSingle();

    return ok(res, {
      status: 'success',
      member: {
        ...member,
        plan_name: membership?.plans?.name || null,
        amount_due_today: Number(payment.amount),
        recurring_amount: Number(membership?.monthly_amount || 0),
      },
    });
  } catch (err) {
    console.error('verify error:', err.message);
    return serverError(res, err.message || 'Could not verify payment');
  }
}
