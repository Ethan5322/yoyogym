// Shared, idempotent activation logic used by both the payment verify endpoint
// and the webhook. Marks a payment as received, stores the Paystack
// authorization code for future recurring billing (own-cron approach), and
// activates the membership + member.
import { onPaymentReceived } from './notify/index.js';

export async function activatePayment(supabase, payment, paystackData) {
  if (!payment || payment.status === 'received') return; // idempotent

  const authCode = paystackData?.authorization?.authorization_code || null;
  const now = new Date().toISOString();

  await supabase
    .from('payments')
    .update({
      status: 'received',
      method: 'paystack_card',
      paystack_auth_code: authCode,
      paid_at: now,
      updated_at: now,
    })
    .eq('id', payment.id);

  if (payment.membership_id) {
    const upd = { state: 'active', updated_at: now };
    if (authCode) upd.paystack_auth_code = authCode; // for recurring billing cron
    await supabase.from('memberships').update(upd).eq('id', payment.membership_id);
  }

  if (payment.member_id) {
    await supabase
      .from('members')
      .update({ status: 'active', updated_at: now })
      .eq('id', payment.member_id);

    // Receipt to member + payment alert to owner (best-effort).
    const { data: member } = await supabase
      .from('members')
      .select('id, full_name, email')
      .eq('id', payment.member_id)
      .maybeSingle();
    if (member) {
      await onPaymentReceived(supabase, {
        member,
        amount: Number(payment.amount),
        description: payment.description,
      });
    }
  }
}
