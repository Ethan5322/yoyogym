// Overdue-member suspension. Endpoint + run().
//
// Replaces the old Paystack retry-and-suspend job. There are no card retries
// any more: members pay the gym directly and staff record it, so "overdue"
// simply means the membership's billing date has passed and no payment was
// captured.
//
// OFF BY DEFAULT. Each gym decides whether it wants this at all — payment
// arrangements are the gym's own business — so it is enabled per gym in
// Admin -> Settings under the "billing_rules" key:
//
//   { "auto_suspend_overdue": true, "grace_days": 7 }
//
// With it disabled (the default) this job does nothing and staff suspend
// members by hand from the admin panel.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, ok, serverError } from '../../lib/http.js';
import { authorizeCron } from '../../lib/cron.js';
import { notifyOwner, notifyMemberEmail } from '../../lib/notify/index.js';
import { ownerTemplates } from '../../lib/notify/templates.js';

export const DEFAULT_BILLING_RULES = {
  auto_suspend_overdue: false, // opt-in: never suspend a member unless the gym asks for it
  grace_days: 7, // days past next_billing_date before a member counts as overdue
};

/** Per-gym billing rules from Admin -> Settings (key "billing_rules"). */
export async function loadBillingRules(supabase) {
  const { data } = await supabase.from('settings').select('value').eq('key', 'billing_rules').maybeSingle();
  return { ...DEFAULT_BILLING_RULES, ...(data?.value || {}) };
}

const isoDate = (d) => d.toISOString().slice(0, 10);

export async function run(supabase) {
  const rules = await loadBillingRules(supabase);
  if (!rules.auto_suspend_overdue) return { skipped: 'auto_suspend_disabled' };

  const graceDays = Number(rules.grace_days) || 0;
  const cutoff = isoDate(new Date(Date.now() - graceDays * 86400000));
  const now = new Date().toISOString();

  // Active, full-visit memberships whose billing date passed more than the
  // grace period ago. A membership is only overdue if nobody captured a
  // payment, which would have pushed next_billing_date forward.
  const { data: overdue, error } = await supabase
    .from('memberships')
    .select('id, member_id, next_billing_date, members(full_name, email, status, membership_number)')
    .eq('state', 'active')
    .eq('visit_type', 'full')
    .lt('next_billing_date', cutoff);
  if (error) throw new Error(error.message);

  let suspended = 0;

  for (const m of overdue || []) {
    const member = m.members;
    if (!member || member.status === 'suspended') continue;

    const { error: updErr } = await supabase
      .from('members')
      .update({ status: 'suspended', updated_at: now })
      .eq('id', m.member_id);
    if (updErr) continue; // leave it for the next run rather than half-reporting

    if (member.email) {
      await notifyMemberEmail(
        supabase,
        { id: m.member_id, full_name: member.full_name, email: member.email },
        'suspended',
        {}
      );
    }
    await notifyOwner(
      supabase,
      'suspended',
      ownerTemplates.suspended({
        member: { full_name: member.full_name, membership_number: member.membership_number || '' },
      }),
      m.member_id
    );
    suspended++;
  }

  return { processed: (overdue || []).length, suspended, grace_days: graceDays };
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;
  if (!authorizeCron(req, res)) return;
  try {
    return ok(res, await run(getSupabase()));
  } catch (err) {
    console.error('suspend-overdue cron error:', err.message);
    return serverError(res, 'Suspension run failed');
  }
}
