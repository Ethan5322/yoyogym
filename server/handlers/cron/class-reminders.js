// Class reminders (spec 2.6 / #44). Endpoint + run().
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, ok, serverError } from '../../lib/http.js';
import { authorizeCron } from '../../lib/cron.js';
import { notifyMemberEmail } from '../../lib/notify/index.js';

export async function run(supabase) {
  const today = new Date().toISOString().slice(0, 10);

  const { data: bookings, error } = await supabase
    .from('class_bookings')
    .select('id, members(id, full_name, email), classes(name, start_time)')
    .eq('session_date', today)
    .eq('status', 'booked')
    .eq('reminder_sent', false);
  if (error) throw new Error(error.message);

  let sent = 0;
  for (const b of bookings || []) {
    const member = b.members;
    if (member?.email) {
      await notifyMemberEmail(supabase, { id: member.id, full_name: member.full_name, email: member.email }, 'class_reminder', {
        className: b.classes?.name || 'your class',
        when: b.classes?.start_time ? `today at ${b.classes.start_time.slice(0, 5)}` : 'today',
      });
      sent++;
    }
    await supabase.from('class_bookings').update({ reminder_sent: true }).eq('id', b.id);
  }

  return { reminded: sent };
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;
  if (!authorizeCron(req, res)) return;
  try {
    return ok(res, await run(getSupabase()));
  } catch (err) {
    console.error('class-reminders cron error:', err.message);
    return serverError(res, 'Class reminder run failed');
  }
}
