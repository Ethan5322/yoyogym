// Challenges, as the owner runs them (CLAUDE.md §41.1 Q3). Owner, manager.
//   GET                 every challenge, with how many joined and finished
//   GET ?id=…           one challenge's entries — full names: it is the gym's own data
//   POST  { title, description, target_visits, starts_on, ends_on }
//   PATCH { id, …same fields…, is_active }
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError } from '../../lib/http.js';
import { requireRole } from '../../lib/auth.js';
import { recordAudit } from '../../lib/audit.js';
import { challengeProgress, challengeState } from '../../lib/loyalty.js';
import { ymd } from '../../lib/pauses.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const text = (v, max) => String(v ?? '').trim().slice(0, max);

/** Check-ins for these members inside the challenge's dates. */
async function visitsFor(supabase, challenge, memberIds) {
  if (!memberIds.length) return new Map();
  const { data } = await supabase
    .from('checkins')
    .select('member_id, checked_in_at')
    .in('member_id', memberIds)
    .gte('checked_in_at', `${challenge.starts_on}T00:00:00Z`)
    .lte('checked_in_at', `${challenge.ends_on}T23:59:59Z`);
  const by = new Map();
  for (const c of data || []) by.set(c.member_id, [...(by.get(c.member_id) || []), c.checked_in_at]);
  return by;
}

function readChallenge(body) {
  const out = {};
  if (body.title !== undefined) out.title = text(body.title, 100);
  if (body.description !== undefined) out.description = text(body.description, 400) || null;
  if (body.target_visits !== undefined) out.target_visits = Number.parseInt(body.target_visits, 10);
  if (body.starts_on !== undefined) out.starts_on = String(body.starts_on);
  if (body.ends_on !== undefined) out.ends_on = String(body.ends_on);
  if (body.is_active !== undefined) out.is_active = Boolean(body.is_active);
  return out;
}

function challengeProblem(c, { creating }) {
  if (creating && !c.title) return 'Give the challenge a title.';
  if (c.title === '') return 'Give the challenge a title.';
  if (c.target_visits !== undefined && (!Number.isInteger(c.target_visits) || c.target_visits < 1 || c.target_visits > 365)) {
    return 'The target is a number of visits, from 1 to 365.';
  }
  if (creating && (!DATE.test(c.starts_on || '') || !DATE.test(c.ends_on || ''))) return 'Choose a start and an end date.';
  if (c.starts_on && c.ends_on && c.ends_on < c.starts_on) return 'The end date is before the start date.';
  return null;
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST', 'PATCH'])) return;
  const admin = requireRole(req, res, ['owner', 'manager']);
  if (!admin) return;
  const supabase = getSupabase();
  const today = ymd(new Date());

  try {
    if (req.method === 'GET') {
      const id = new URL(req.url, 'http://localhost').searchParams.get('id');
      if (id) {
        const [{ data: challenge }, { data: entries }] = await Promise.all([
          supabase.from('challenges').select('*').eq('id', id).maybeSingle(),
          supabase.from('challenge_entries').select('member_id, show_on_board, joined_at, members(full_name, membership_number)').eq('challenge_id', id),
        ]);
        if (!challenge) return badRequest(res, 'Challenge not found.');
        const visits = await visitsFor(supabase, challenge, (entries || []).map((e) => e.member_id));
        const rows = (entries || [])
          .map(({ members, ...e }) => {
            const progress = challengeProgress(visits.get(e.member_id) || [], challenge);
            return { ...e, full_name: members?.full_name || '', membership_number: members?.membership_number || '', progress, done: progress >= challenge.target_visits };
          })
          .sort((a, b) => b.progress - a.progress);
        return ok(res, { challenge: { ...challenge, state: challengeState(challenge, today) }, entries: rows });
      }

      const { data: challenges, error } = await supabase.from('challenges').select('*').order('starts_on', { ascending: false }).limit(100);
      if (error) return serverError(res, error.message);
      const { data: entries } = await supabase
        .from('challenge_entries')
        .select('challenge_id, member_id')
        .in('challenge_id', (challenges || []).map((c) => c.id));
      const out = [];
      for (const c of challenges || []) {
        const ids = (entries || []).filter((e) => e.challenge_id === c.id).map((e) => e.member_id);
        const visits = await visitsFor(supabase, c, ids);
        const finished = ids.filter((m) => challengeProgress(visits.get(m) || [], c) >= c.target_visits).length;
        out.push({ ...c, state: challengeState(c, today), joined: ids.length, finished });
      }
      return ok(res, { challenges: out, today });
    }

    const body = await readJsonBody(req);
    const c = readChallenge(body);
    const problem = challengeProblem(c, { creating: req.method === 'POST' });
    if (problem) return badRequest(res, problem);

    if (req.method === 'POST') {
      const { data, error } = await supabase.from('challenges').insert(c).select('id').single();
      if (error) return serverError(res, error.message);
      await recordAudit(supabase, admin, { action: 'challenge.created', entity: 'challenge', entity_id: data.id });
      return ok(res, { id: data.id });
    }

    const { error } = await supabase.from('challenges').update({ ...c, updated_at: new Date().toISOString() }).eq('id', body.id);
    if (error) return serverError(res, error.message);
    await recordAudit(supabase, admin, { action: 'challenge.updated', entity: 'challenge', entity_id: body.id });
    return ok(res, { saved: true });
  } catch (err) {
    console.error('challenges error:', err.message);
    return serverError(res, 'Could not update the challenges.');
  }
}
