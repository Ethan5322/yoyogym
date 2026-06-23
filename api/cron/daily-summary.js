// Owner daily summary (spec Part 5 #10 / #45). Endpoint + run().
import { getSupabase } from '../_lib/supabase.js';
import { allowMethods, ok, serverError } from '../_lib/http.js';
import { authorizeCron } from '../_lib/cron.js';
import { notifyOwner } from '../_lib/notify/index.js';
import { ownerTemplates } from '../_lib/notify/templates.js';

export async function run(supabase) {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const iso = dayStart.toISOString();
  const todayYmd = dayStart.toISOString().slice(0, 10);
  const dow = dayStart.getDay();

  const count = async (q) => (await q).count || 0;
  const [checkins, newMembers, payments, classes] = await Promise.all([
    count(supabase.from('checkins').select('id', { count: 'exact', head: true }).gte('checked_in_at', iso)),
    count(supabase.from('members').select('id', { count: 'exact', head: true }).gte('created_at', iso)),
    supabase.from('payments').select('amount').eq('status', 'received').gte('paid_at', iso),
    supabase.from('classes').select('recurrence, day_of_week, class_date').eq('is_active', true),
  ]);

  const revenue = (payments.data || []).reduce((s, p) => s + Number(p.amount || 0), 0);
  const classesHeld = (classes.data || []).filter((c) =>
    c.recurrence === 'recurring' ? c.day_of_week === dow : c.class_date === todayYmd
  ).length;

  await notifyOwner(supabase, 'daily_summary', ownerTemplates.daily_summary({ checkins, revenue, newMembers, classesHeld }));
  return { checkins, revenue, newMembers, classesHeld };
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;
  if (!authorizeCron(req, res)) return;
  try {
    return ok(res, await run(getSupabase()));
  } catch (err) {
    console.error('daily-summary cron error:', err.message);
    return serverError(res, 'Daily summary failed');
  }
}
