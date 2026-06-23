// CRON (daily 10:00) — Win-back email for lapsed members (spec 3.2 #46).
// Targets members whose membership ended ~7 days ago, sent once.
import { getSupabase } from '../_lib/supabase.js';
import { allowMethods, ok, serverError } from '../_lib/http.js';
import { authorizeCron } from '../_lib/cron.js';
import { notifyMemberEmail } from '../_lib/notify/index.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;
  if (!authorizeCron(req, res)) return;

  try {
    const supabase = getSupabase();
    const sevenAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

    // Memberships that ended exactly 7 days ago, whose member is lapsed.
    const { data: ended, error } = await supabase
      .from('memberships')
      .select('member_id, members(id, full_name, email, status)')
      .eq('end_date', sevenAgo);
    if (error) return serverError(res, error.message);

    let sent = 0;
    for (const m of ended || []) {
      const member = m.members;
      if (member && member.status === 'lapsed' && member.email) {
        await notifyMemberEmail(supabase, { id: member.id, full_name: member.full_name, email: member.email }, 'reengagement', {});
        sent++;
      }
    }

    return ok(res, { reengaged: sent });
  } catch (err) {
    console.error('reengagement cron error:', err.message);
    return serverError(res, 'Re-engagement run failed');
  }
}
