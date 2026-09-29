// "Pause my membership", from the member's own phone (CLAUDE.md §41.1 Q3).
//   GET                        the gym's rules, a running pause, and how many are left this year
//   POST { days, reason }      pause from today, within the owner's rules
//   POST { action: 'resume' }  come back early; unused days come off the end date
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError } from '../../lib/http.js';
import { authenticateMember } from '../../lib/memberauth.js';
import {
  PAUSE_RULES_KEY,
  cleanPauseRules,
  pauseProblem,
  pausePeriod,
  openPause,
  pausesThisYear,
  ymd,
} from '../../lib/pauses.js';
import { shiftEndDate, endPause } from '../../lib/pause-actions.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;
  const auth = authenticateMember(req, res);
  if (!auth) return;

  const supabase = getSupabase();
  const today = ymd(new Date());

  try {
    const [{ data: rulesRow }, { data: member }, { data: pauses, error }] = await Promise.all([
      supabase.from('settings').select('value').eq('key', PAUSE_RULES_KEY).maybeSingle(),
      supabase.from('members').select('id, status').eq('id', auth.sub).maybeSingle(),
      supabase.from('membership_pauses').select('*').eq('member_id', auth.sub).order('starts_on', { ascending: false }),
    ]);
    if (error) return serverError(res, error.message);
    if (!member) return badRequest(res, 'Member not found.');
    const rules = cleanPauseRules(rulesRow?.value);
    const current = openPause(pauses || [], today);

    if (req.method === 'GET') {
      const used = pausesThisYear(pauses || [], today).length;
      return ok(res, {
        rules,
        current,
        used_this_year: used,
        left_this_year: Math.max(0, rules.max_per_year - used),
        can_pause: !current && member.status === 'active' && used < rules.max_per_year,
      });
    }

    const body = await readJsonBody(req);

    if (body.action === 'resume') {
      if (!current) return badRequest(res, 'Your membership is not paused.');
      const unused = await endPause(supabase, current, today);
      return ok(res, { resumed: true, unused_days: unused, message: 'Welcome back — you can check in again.' });
    }

    const days = Number(body.days);
    const problem = pauseProblem({ days, rules, member, pauses: pauses || [], today });
    if (problem) return badRequest(res, problem);

    const period = pausePeriod(today, days);
    const membershipId = await shiftEndDate(supabase, member.id, days);
    const { error: insErr } = await supabase.from('membership_pauses').insert({
      member_id: member.id,
      membership_id: membershipId,
      ...period,
      reason: String(body.reason || '').trim().slice(0, 300) || null,
      created_by: 'member',
    });
    if (insErr) return serverError(res, insErr.message);
    await supabase.from('members').update({ status: 'frozen' }).eq('id', member.id);

    return ok(res, {
      paused: true,
      ...period,
      fee: rules.fee,
      message: `Paused until ${period.ends_on}. Your membership end date has moved on by ${days} days.`,
    });
  } catch (err) {
    console.error('member pause error:', err.message);
    return serverError(res, 'Could not update your pause.');
  }
}
