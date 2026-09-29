// Membership pauses, as staff see them (CLAUDE.md §41.1 Q3). Owner, manager,
// reception.
//   GET  ?member_id=…              that member's pauses, newest first
//   GET  (no member)               every pause running today
//   POST { member_id, days, reason }   staff pause a member — the owner's
//                                      limits do not bind staff, 1 to 365 days
//   POST { action: 'end', pause_id }   end a pause today; unused days come off
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError } from '../../lib/http.js';
import { requireRole } from '../../lib/auth.js';
import { recordAudit } from '../../lib/audit.js';
import { ymd, pausePeriod, openPause } from '../../lib/pauses.js';
import { shiftEndDate, endPause } from '../../lib/pause-actions.js';

const STAFF = ['owner', 'manager', 'reception'];

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;
  const admin = requireRole(req, res, STAFF);
  if (!admin) return;

  const supabase = getSupabase();
  const today = ymd(new Date());

  try {
    if (req.method === 'GET') {
      const memberId = new URL(req.url, 'http://localhost').searchParams.get('member_id');
      let q = supabase.from('membership_pauses').select('*').order('starts_on', { ascending: false });
      q = memberId ? q.eq('member_id', memberId) : q.is('resumed_at', null).gte('ends_on', today).lte('starts_on', today);
      const { data, error } = await q.limit(200);
      if (error) return serverError(res, error.message);
      return ok(res, { pauses: data || [], today });
    }

    const body = await readJsonBody(req);

    if (body.action === 'end') {
      const { data: pause } = await supabase.from('membership_pauses').select('*').eq('id', body.pause_id).maybeSingle();
      if (!pause || pause.resumed_at) return badRequest(res, 'That pause is not running.');
      const unused = await endPause(supabase, pause, today);
      await recordAudit(supabase, admin, { action: 'member.pause_ended', entity: 'member', entity_id: pause.member_id, detail: { unused } });
      return ok(res, { ended: true, unused_days: unused });
    }

    const days = Number(body.days);
    if (!body.member_id) return badRequest(res, 'member_id is required.');
    if (!Number.isInteger(days) || days < 1 || days > 365) return badRequest(res, 'Choose between 1 and 365 days.');

    const [{ data: member }, { data: pauses }] = await Promise.all([
      supabase.from('members').select('id, status').eq('id', body.member_id).maybeSingle(),
      supabase.from('membership_pauses').select('*').eq('member_id', body.member_id),
    ]);
    if (!member) return badRequest(res, 'Member not found.');
    if (openPause(pauses || [], today) || member.status === 'frozen') return badRequest(res, 'This membership is already paused.');
    if (member.status !== 'active') return badRequest(res, 'Only an active membership can be paused.');

    const period = pausePeriod(today, days);
    const membershipId = await shiftEndDate(supabase, member.id, days);
    const { error } = await supabase.from('membership_pauses').insert({
      member_id: member.id,
      membership_id: membershipId,
      ...period,
      reason: String(body.reason || '').trim().slice(0, 300) || null,
      created_by: 'staff',
    });
    if (error) return serverError(res, error.message);
    await supabase.from('members').update({ status: 'frozen' }).eq('id', member.id);
    await recordAudit(supabase, admin, { action: 'member.paused', entity: 'member', entity_id: member.id, detail: { days } });
    return ok(res, { paused: true, ...period });
  } catch (err) {
    console.error('pauses error:', err.message);
    return serverError(res, 'Could not update the pause.');
  }
}
