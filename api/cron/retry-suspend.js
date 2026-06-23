// Failed payment retry + suspension (spec 3.1 / #42). Endpoint + run().
import { getSupabase } from '../_lib/supabase.js';
import { allowMethods, ok, serverError } from '../_lib/http.js';
import { authorizeCron } from '../_lib/cron.js';
import { paystackConfigured, chargeAuthorization, newReference } from '../_lib/paystack.js';
import { onPaymentReceived, notifyOwner, notifyMemberEmail } from '../_lib/notify/index.js';
import { ownerTemplates } from '../_lib/notify/templates.js';

export async function run(supabase) {
  if (!paystackConfigured()) return { skipped: 'paystack_not_configured' };
  const now = new Date().toISOString();

  const { data: failures, error } = await supabase
    .from('payments')
    .select('*, members(email, full_name), memberships(paystack_auth_code)')
    .eq('status', 'failed')
    .lte('next_retry_at', now)
    .lt('retry_count', 2);
  if (error) throw new Error(error.message);

  let recovered = 0;
  let suspended = 0;

  for (const p of failures || []) {
    const authCode = p.memberships?.paystack_auth_code;
    const member = p.members;
    if (!authCode || !member) continue;

    const reference = newReference('RETRY');
    try {
      const data = await chargeAuthorization({ email: member.email, amount: p.amount, authorization_code: authCode, reference });
      if (data.status !== 'success') throw new Error('declined');
      await supabase
        .from('payments')
        .update({ status: 'received', paid_at: now, paystack_reference: reference, updated_at: now })
        .eq('id', p.id);
      await onPaymentReceived(supabase, {
        member: { id: p.member_id, full_name: member.full_name, email: member.email },
        amount: p.amount,
        description: p.description || 'Membership payment (retry)',
      });
      recovered++;
    } catch {
      const attempts = (p.retry_count || 0) + 1;
      if (attempts >= 2) {
        await supabase.from('payments').update({ retry_count: attempts, updated_at: now }).eq('id', p.id);
        await supabase.from('members').update({ status: 'suspended', updated_at: now }).eq('id', p.member_id);
        await notifyMemberEmail(supabase, { id: p.member_id, full_name: member.full_name, email: member.email }, 'suspended', {});
        await notifyOwner(supabase, 'suspended', ownerTemplates.suspended({ member: { full_name: member.full_name, membership_number: '' } }), p.member_id);
        suspended++;
      } else {
        await supabase
          .from('payments')
          .update({ retry_count: attempts, next_retry_at: new Date(Date.now() + 3 * 86400000).toISOString(), updated_at: now })
          .eq('id', p.id);
      }
    }
  }

  return { processed: (failures || []).length, recovered, suspended };
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;
  if (!authorizeCron(req, res)) return;
  try {
    return ok(res, await run(getSupabase()));
  } catch (err) {
    console.error('retry-suspend cron error:', err.message);
    return serverError(res, 'Retry run failed');
  }
}
