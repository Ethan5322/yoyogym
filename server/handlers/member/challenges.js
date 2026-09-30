// Challenges and the leaderboard, for the member (CLAUDE.md §41.1 Q3).
//   GET                                           running and upcoming challenges, my progress, the board
//   POST { challenge_id, action: 'join' | 'leave', show_on_board }
//
// Joining is the member's choice, and so is being on the board. The board
// shows a first name and an initial, never a whole name.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError, failed } from '../../lib/http.js';
import { authenticateMember } from '../../lib/memberauth.js';
import { challengeProgress, challengeState, leaderboard } from '../../lib/loyalty.js';
import { ymd } from '../../lib/pauses.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;
  const auth = authenticateMember(req, res);
  if (!auth) return;
  const supabase = getSupabase();
  const today = ymd(new Date());

  try {
    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const { data: challenge } = await supabase.from('challenges').select('*').eq('id', body.challenge_id).maybeSingle();
      if (!challenge || challengeState(challenge, today) === 'ended') return badRequest(res, 'That challenge is not open.');
      if (body.action === 'leave') {
        await supabase.from('challenge_entries').delete().eq('challenge_id', challenge.id).eq('member_id', auth.sub);
        return ok(res, { joined: false });
      }
      if (body.action !== 'join') return badRequest(res, 'Unknown action.');
      const { error } = await supabase
        .from('challenge_entries')
        .upsert({ challenge_id: challenge.id, member_id: auth.sub, show_on_board: body.show_on_board !== false }, { onConflict: 'challenge_id,member_id' });
      if (error) return failed(res, error);
      return ok(res, { joined: true, message: `You're in: ${challenge.title}.` });
    }

    const { data: challenges, error } = await supabase
      .from('challenges')
      .select('*')
      .eq('is_active', true)
      .gte('ends_on', today)
      .order('starts_on');
    if (error) return failed(res, error);

    const out = [];
    for (const c of challenges || []) {
      const { data: entries } = await supabase
        .from('challenge_entries')
        .select('member_id, show_on_board, joined_at, members(full_name)')
        .eq('challenge_id', c.id);
      const ids = (entries || []).map((e) => e.member_id);
      const { data: visits } = ids.length
        ? await supabase
            .from('checkins')
            .select('member_id, checked_in_at')
            .in('member_id', ids)
            .gte('checked_in_at', `${c.starts_on}T00:00:00Z`)
            .lte('checked_in_at', `${c.ends_on}T23:59:59Z`)
        : { data: [] };
      const byMember = new Map();
      for (const v of visits || []) byMember.set(v.member_id, [...(byMember.get(v.member_id) || []), v.checked_in_at]);
      const rows = (entries || []).map((e) => ({
        member_id: e.member_id,
        full_name: e.members?.full_name || '',
        show_on_board: e.show_on_board,
        joined_at: e.joined_at,
        progress: challengeProgress(byMember.get(e.member_id) || [], c),
        you: e.member_id === auth.sub,
      }));
      const mine = rows.find((r) => r.you);
      out.push({
        id: c.id,
        title: c.title,
        description: c.description,
        target_visits: c.target_visits,
        starts_on: c.starts_on,
        ends_on: c.ends_on,
        state: challengeState(c, today),
        joined: Boolean(mine),
        progress: mine?.progress ?? 0,
        done: Boolean(mine) && mine.progress >= c.target_visits,
        people: rows.length,
        board: leaderboard(rows),
      });
    }
    return ok(res, { challenges: out });
  } catch (err) {
    console.error('member challenges error:', err.message);
    return serverError(res, 'Could not load the challenges.');
  }
}
