// MORNING cron orchestrator (runs 06:00 daily — see vercel.json).
// Runs the day's maintenance automations in sequence. Each job is isolated so
// one failure does not stop the others. Two jobs run on their own schedules and
// are deliberately excluded here: daily-summary (20:00) and weekly-schedule
// (Mon 07:00). All individual endpoints remain callable manually / via an
// external scheduler if you move to more granular hourly timing on Vercel Pro.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, ok } from '../../lib/http.js';
import { authorizeCron } from '../../lib/cron.js';
import { run as retrySuspend } from './retry-suspend.js';
import { run as billing, runReminders as billingReminders } from './billing.js';
import { run as expiry } from './expiry.js';
import { run as classReminders } from './class-reminders.js';
import { run as reengagement } from './reengagement.js';
// NOTE: daily_summary runs on its own 8 PM schedule (spec Part 5 #10), so it is
// intentionally NOT included in this morning orchestrator.

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;
  if (!authorizeCron(req, res)) return;

  const supabase = getSupabase();
  const jobs = [
    ['retry_suspend', retrySuspend],
    ['billing_reminders', billingReminders],
    ['billing', billing],
    ['expiry', expiry],
    ['class_reminders', classReminders],
    ['reengagement', reengagement],
  ];

  const results = {};
  for (const [name, fn] of jobs) {
    try {
      results[name] = await fn(supabase);
    } catch (err) {
      console.error(`cron job ${name} failed:`, err.message);
      results[name] = { error: err.message };
    }
  }

  return ok(res, { ran: true, at: new Date().toISOString(), results });
}
