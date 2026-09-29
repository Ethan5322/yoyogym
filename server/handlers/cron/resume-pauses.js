// Ends every pause whose last day has passed (CLAUDE.md §41.1 Q3). Part of
// the morning job: a member paused "for 14 days" is active again on day 15
// without anyone having to remember.
import { ymd } from '../../lib/pauses.js';

export async function run(supabase, today = ymd(new Date())) {
  const { data: due, error } = await supabase
    .from('membership_pauses')
    .select('id, member_id')
    .is('resumed_at', null)
    .lt('ends_on', today);
  if (error) return { error: error.message };

  let resumed = 0;
  for (const p of due || []) {
    await supabase.from('membership_pauses').update({ resumed_at: new Date().toISOString() }).eq('id', p.id);
    // Only a member still paused goes back to active; one suspended for
    // another reason in the meantime stays as staff left them.
    const { data } = await supabase.from('members').update({ status: 'active' }).eq('id', p.member_id).eq('status', 'frozen').select('id');
    if (data?.length) resumed += 1;
  }
  return { due: (due || []).length, resumed };
}
