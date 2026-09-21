// Billing reminders (spec 3.1). Exposed as its own endpoint AND callable via
// runReminders() from the consolidated daily cron.
//
// Members pay the gym directly — cash, EFT, or whatever that gym arranges — so
// this job only REMINDS a member that their fee is due. Nothing is charged.
// Staff record the payment in Admin -> Payments, and that capture is what keeps
// the membership active.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, ok, serverError } from '../../lib/http.js';
import { authorizeCron } from '../../lib/cron.js';
import { notifyMemberEmail } from '../../lib/notify/index.js';

const isoDate = (d) => d.toISOString().slice(0, 10);
const fmtDate = (s) => new Date(s).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });

/** Email members whose monthly payment is due in 3 days (spec 3.1). */
export async function runReminders(supabase) {
  const in3 = isoDate(new Date(Date.now() + 3 * 86400000));
  const { data: due, error } = await supabase
    .from('memberships')
    .select('member_id, monthly_amount, next_billing_date, members(full_name, email, status)')
    .eq('state', 'active')
    .eq('visit_type', 'full')
    .eq('next_billing_date', in3);
  if (error) throw new Error(error.message);

  let sent = 0;
  for (const m of due || []) {
    const member = m.members;
    if (!member?.email || member.status === 'suspended') continue;
    await notifyMemberEmail(supabase, { id: m.member_id, full_name: member.full_name, email: member.email }, 'billing_reminder', {
      amount: m.monthly_amount,
      date: fmtDate(m.next_billing_date),
    });
    sent++;
  }
  return { reminded: sent };
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;
  if (!authorizeCron(req, res)) return;
  try {
    return ok(res, await runReminders(getSupabase()));
  } catch (err) {
    console.error('billing reminders cron error:', err.message);
    return serverError(res, 'Billing reminder run failed');
  }
}
