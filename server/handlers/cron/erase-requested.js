// Erases every member who asked to delete their account 30 days ago and has
// not been erased by the gym since (CLAUDE.md §46.1 Q3). Part of the morning
// job, so the stores' promise — "finished within 30 days" — holds even when
// nobody at the gym acts on it.
import { eraseMember, DELETION_DAYS } from '../../lib/member-erasure.js';
import { recordAudit } from '../../lib/audit.js';

export async function run(supabase, now = new Date()) {
  const cutoff = new Date(now.getTime() - DELETION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: due, error } = await supabase
    .from('members')
    .select('id')
    .eq('data_deletion_requested', true)
    .lte('data_deletion_requested_at', cutoff)
    .limit(200);
  if (error) return { error: error.message };

  let erased = 0;
  let failedCount = 0;
  for (const m of due || []) {
    const result = await eraseMember(supabase, m.id, { confirm: true });
    if (result.ok) {
      erased += 1;
      await recordAudit(supabase, null, {
        action: 'member.erased_on_request',
        entity: 'member',
        entity_id: m.id,
        detail: `erased ${DELETION_DAYS} days after the member asked`,
      });
    } else if (!result.notFound) {
      failedCount += 1;
      console.error('erase-requested failed:', result.error?.code || '', result.error?.message || '');
    }
  }
  return { due: (due || []).length, erased, failed: failedCount };
}
