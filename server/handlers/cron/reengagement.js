// Win-back email for lapsed members (spec 3.2 #46). Endpoint + run().
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, ok, serverError } from '../../lib/http.js';
import { authorizeCron } from '../../lib/cron.js';
import { notifyMemberEmail } from '../../lib/notify/index.js';

export async function run(supabase) {
  const sevenAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const { data: ended, error } = await supabase
    .from('memberships')
    .select('member_id, members(id, full_name, email, status)')
    .eq('end_date', sevenAgo);
  if (error) throw new Error(error.message);

  let sent = 0;
  for (const m of ended || []) {
    const member = m.members;
    if (member && member.status === 'lapsed' && member.email) {
      await notifyMemberEmail(supabase, { id: member.id, full_name: member.full_name, email: member.email }, 'reengagement', {});
      sent++;
    }
  }
  return { reengaged: sent };
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;
  if (!authorizeCron(req, res)) return;
  try {
    return ok(res, await run(getSupabase()));
  } catch (err) {
    console.error('reengagement cron error:', err.message);
    return serverError(res, 'Re-engagement run failed');
  }
}
