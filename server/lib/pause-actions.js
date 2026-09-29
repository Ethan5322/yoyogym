// The database side of a pause (CLAUDE.md §41.1 Q3), shared by the member's
// own "Pause my membership" and the staff screen. The rules are in pauses.js.
import { ymd, addDays, unusedDays } from './pauses.js';

/** Move the member's active membership's end date by `days` (may be negative). */
export async function shiftEndDate(supabase, memberId, days) {
  const { data: m } = await supabase
    .from('memberships')
    .select('id, end_date')
    .eq('member_id', memberId)
    .eq('state', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  // An open-ended membership has no end date to move.
  if (!m?.end_date || !days) return m?.id ?? null;
  await supabase
    .from('memberships')
    .update({ end_date: addDays(String(m.end_date).slice(0, 10), days), updated_at: new Date().toISOString() })
    .eq('id', m.id);
  return m.id;
}

/** End a pause today: the member is active again and unused days come back off the end date. */
export async function endPause(supabase, pause, today = ymd(new Date())) {
  const unused = unusedDays(pause, today);
  await supabase.from('membership_pauses').update({ resumed_at: new Date().toISOString() }).eq('id', pause.id);
  if (unused) await shiftEndDate(supabase, pause.member_id, -unused);
  await supabase.from('members').update({ status: 'active' }).eq('id', pause.member_id).eq('status', 'frozen');
  return unused;
}
