// Monthly recurring billing (spec 3.1 / #41). Exposed as its own endpoint AND
// callable via run() from the consolidated daily cron (Hobby-plan friendly).
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, ok, serverError } from '../../lib/http.js';
import { authorizeCron } from '../../lib/cron.js';
import { paystackConfigured, chargeAuthorization, newReference } from '../../lib/paystack.js';
import { onPaymentReceived, notifyOwner } from '../../lib/notify/index.js';
import { ownerTemplates } from '../../lib/notify/templates.js';

const isoDate = (d) => d.toISOString().slice(0, 10);
function addMonths(date, n) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

export async function run(supabase) {
  if (!paystackConfigured()) return { skipped: 'paystack_not_configured' };
  const today = isoDate(new Date());

  const { data: due, error } = await supabase
    .from('memberships')
    .select('id, member_id, monthly_amount, paystack_auth_code, members(email, full_name, status)')
    .eq('state', 'active')
    .eq('visit_type', 'full')
    .lte('next_billing_date', today)
    .not('paystack_auth_code', 'is', null);
  if (error) throw new Error(error.message);

  let charged = 0;
  let failed = 0;

  for (const m of due || []) {
    const member = m.members;
    if (!member || member.status === 'suspended' || !m.monthly_amount) continue;

    const reference = newReference('SUB');
    const { data: payment } = await supabase
      .from('payments')
      .insert({
        member_id: m.member_id,
        membership_id: m.id,
        category: 'monthly_fee',
        amount: m.monthly_amount,
        status: 'pending',
        method: 'paystack_debit',
        paystack_reference: reference,
        description: 'Monthly membership fee',
      })
      .select('id')
      .single();

    // Advance billing date on attempt so a period is never double-charged.
    await supabase
      .from('memberships')
      .update({ next_billing_date: isoDate(addMonths(new Date(), 1)), updated_at: new Date().toISOString() })
      .eq('id', m.id);

    try {
      const data = await chargeAuthorization({
        email: member.email,
        amount: m.monthly_amount,
        authorization_code: m.paystack_auth_code,
        reference,
      });
      if (data.status !== 'success') throw new Error(data.gateway_response || 'charge_declined');
      await supabase
        .from('payments')
        .update({ status: 'received', paid_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', payment.id);
      await onPaymentReceived(supabase, {
        member: { id: m.member_id, full_name: member.full_name, email: member.email },
        amount: m.monthly_amount,
        description: 'Monthly membership fee',
      });
      charged++;
    } catch {
      await supabase
        .from('payments')
        .update({
          status: 'failed',
          retry_count: 1,
          next_retry_at: new Date(Date.now() + 3 * 86400000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', payment.id);
      await notifyOwner(
        supabase,
        'payment_failed',
        ownerTemplates.payment_failed({ member: { full_name: member.full_name }, amount: m.monthly_amount }),
        m.member_id
      );
      failed++;
    }
  }

  return { processed: (due || []).length, charged, failed };
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;
  if (!authorizeCron(req, res)) return;
  try {
    return ok(res, await run(getSupabase()));
  } catch (err) {
    console.error('billing cron error:', err.message);
    return serverError(res, 'Billing run failed');
  }
}
