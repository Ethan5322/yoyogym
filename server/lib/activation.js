// Shared activation logic: a RECORDED payment activates the member and their
// membership. Members pay the gym directly (cash / EFT / the gym's own
// arrangement); staff capture that payment in Admin → Payments, and capturing
// it is what makes the member active.
//
// "payment recorded = member active" is the rule. Nothing else activates a
// member automatically.
import { onPaymentReceived } from './notify/index.js';

/**
 * Activate the member + membership attached to a received payment.
 * Safe to call more than once: setting an already-active record to active is a
 * no-op, so a double capture cannot corrupt state.
 *
 * Returns { activated, error } rather than throwing — the payment itself is
 * already recorded by the caller, so a failure here must be reported without
 * pretending the payment did not happen.
 */
export async function activateForPayment(supabase, payment) {
  if (!payment) return { activated: false, error: 'no payment' };

  const now = new Date().toISOString();

  if (payment.membership_id) {
    const { error } = await supabase
      .from('memberships')
      .update({ state: 'active', updated_at: now })
      .eq('id', payment.membership_id);
    if (error) return { activated: false, error: `membership: ${error.message}` };
  }

  if (!payment.member_id) {
    // A payment with no member (e.g. a walk-in day pass) records fine but
    // activates nobody. Not an error.
    return { activated: false };
  }

  const { error: memberErr } = await supabase
    .from('members')
    .update({ status: 'active', updated_at: now })
    .eq('id', payment.member_id);
  if (memberErr) return { activated: false, error: `member: ${memberErr.message}` };

  // Receipt to the member + payment alert to the owner (best-effort: a
  // notification failure must never undo an activation).
  const { data: member } = await supabase
    .from('members')
    .select('id, full_name, email, membership_number')
    .eq('id', payment.member_id)
    .maybeSingle();

  if (member) {
    try {
      await onPaymentReceived(supabase, {
        member,
        amount: Number(payment.amount),
        description: payment.description,
        membershipNumber: member.membership_number,
      });
    } catch {
      /* notification failure is never fatal */
    }
  }

  return { activated: true };
}
