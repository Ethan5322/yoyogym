// POST /api/member/request-plan-change  { plan_id, note }
// A member requests to move to a different plan. This does NOT change billing —
// it lands in the admin inbox for an owner/manager to approve & apply. Members
// can never change their own price.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError } from '../../lib/http.js';
import { authenticateMember } from '../../lib/memberauth.js';
import { notifyAdmin } from '../../lib/inbox.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  const auth = authenticateMember(req, res);
  if (!auth) return;

  try {
    const { plan_id, note } = await readJsonBody(req);
    if (!plan_id) return badRequest(res, 'Please choose a plan.');

    const supabase = getSupabase();
    const [{ data: member }, { data: plan }] = await Promise.all([
      supabase.from('members').select('id, full_name, membership_number').eq('id', auth.sub).maybeSingle(),
      supabase.from('plans').select('id, name').eq('id', plan_id).eq('is_enabled', true).maybeSingle(),
    ]);
    if (!member) return badRequest(res, 'Member not found.');
    if (!plan) return badRequest(res, 'That plan is not available.');

    const r = await notifyAdmin(supabase, {
      kind: 'event',
      type: 'plan.change_request',
      title: `${member.full_name} requests plan change → ${plan.name}`,
      body: (note || '').trim() || null,
      member_id: member.id,
      sender_name: `${member.full_name} (${member.membership_number})`,
      sender_role: 'member',
      link: `/admin/members/${member.id}`,
    });
    if (!r.ok) return serverError(res, 'Could not submit your request. Please try again.');
    return ok(res, { sent: true, message: `Request sent — management will review your move to ${plan.name}.` });
  } catch (err) {
    console.error('request-plan-change error:', err.message);
    return serverError(res, 'Could not submit your request.');
  }
}
