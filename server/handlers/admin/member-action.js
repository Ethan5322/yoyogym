// POST /api/admin/member-action?id=...  { action }   (spec 4.4 quick actions)
//   action = "checkin"          -> log a manual check-in
//          | "regenerate_code"  -> issue a new verification code
//          | "renew"            -> extend the current membership
// Owner/Manager (reception may also do manual check-in).
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError } from '../../lib/http.js';
import { requireRole } from '../../lib/auth.js';
import { generateVerificationCode } from '../../lib/identifiers.js';
import { DURATION_MONTHS, computeMembership } from '../../../shared/pricing.js';
import { recordAudit } from '../../lib/audit.js';

const isoDate = (d) => d.toISOString().slice(0, 10);
function addMonths(date, n) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  const id = new URL(req.url, 'http://localhost').searchParams.get('id');
  if (!id) return badRequest(res, 'id is required.');

  const body = await readJsonBody(req);
  const { action } = body;
  const allowed = action === 'checkin' ? ['owner', 'manager', 'reception'] : ['owner', 'manager'];
  const admin = requireRole(req, res, allowed);
  if (!admin) return;

  const supabase = getSupabase();

  try {
    if (action === 'checkin') {
      const { error } = await supabase
        .from('checkins')
        .insert({ member_id: id, method: 'manual', verified_by: admin.sub });
      if (error) return serverError(res, error.message);
      return ok(res, { message: 'Manual check-in logged.' });
    }

    if (action === 'regenerate_code') {
      const code = await generateVerificationCode(supabase);
      const { error } = await supabase
        .from('members')
        .update({ verification_code: code, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) return serverError(res, error.message);
      await recordAudit(supabase, admin, { action: 'member.regenerate_code', entity: 'member', entity_id: id });
      return ok(res, { message: 'New verification code generated.', verification_code: code });
    }

    if (action === 'renew') {
      const { data: membership } = await supabase
        .from('memberships')
        .select('*')
        .eq('member_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!membership) return badRequest(res, 'No membership to renew.');

      const months = DURATION_MONTHS[membership.contract_duration] || 1;
      const base = membership.end_date && new Date(membership.end_date) > new Date()
        ? new Date(membership.end_date)
        : new Date();
      const newEnd = isoDate(addMonths(base, months));

      await supabase
        .from('memberships')
        .update({
          state: 'active',
          end_date: membership.visit_type === 'full' ? newEnd : membership.end_date,
          next_billing_date: membership.visit_type === 'full' ? isoDate(addMonths(new Date(), 1)) : membership.next_billing_date,
          updated_at: new Date().toISOString(),
        })
        .eq('id', membership.id);
      await supabase.from('members').update({ status: 'active', updated_at: new Date().toISOString() }).eq('id', id);

      await recordAudit(supabase, admin, { action: 'member.renew', entity: 'member', entity_id: id, detail: membership.visit_type === 'full' ? `until ${newEnd}` : null });
      return ok(res, { message: `Membership renewed${membership.visit_type === 'full' ? ` until ${newEnd}` : ''}.` });
    }

    if (action === 'change_plan') {
      if (!body.plan_id) return badRequest(res, 'plan_id is required.');
      const { data: plan } = await supabase
        .from('plans')
        .select('*')
        .eq('id', body.plan_id)
        .eq('is_enabled', true)
        .maybeSingle();
      if (!plan) return badRequest(res, 'Plan not available.');

      const { data: membership } = await supabase
        .from('memberships')
        .select('id, contract_duration')
        .eq('member_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!membership) return badRequest(res, 'No membership to change.');

      const m = computeMembership(plan, membership.contract_duration);
      await supabase
        .from('memberships')
        .update({
          plan_id: plan.id,
          visit_type: m.visit_type,
          tier: m.tier,
          monthly_amount: m.monthly_amount,
          sessions_total: m.sessions_total,
          updated_at: new Date().toISOString(),
        })
        .eq('id', membership.id);
      await recordAudit(supabase, admin, { action: 'member.change_plan', entity: 'member', entity_id: id, detail: `→ ${plan.name}` });
      return ok(res, { message: `Plan changed to ${plan.name}.` });
    }

    return badRequest(res, 'Unknown action.');
  } catch (err) {
    console.error('member-action error:', err.message);
    return serverError(res, 'Action failed');
  }
}
