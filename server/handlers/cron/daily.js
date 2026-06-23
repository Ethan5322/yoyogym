// Consolidated DAILY cron (Hobby-plan friendly — one scheduled job).
// Runs every automation in sequence. Each job is isolated so one failure does
// not stop the others. The individual endpoints remain callable manually /
// via an external scheduler if you later move to more granular timing.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, ok } from '../../lib/http.js';
import { authorizeCron } from '../../lib/cron.js';
import { run as retrySuspend } from './retry-suspend.js';
import { run as billing } from './billing.js';
import { run as expiry } from './expiry.js';
import { run as classReminders } from './class-reminders.js';
import { run as reengagement } from './reengagement.js';
import { run as dailySummary } from './daily-summary.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;
  if (!authorizeCron(req, res)) return;

  const supabase = getSupabase();
  const jobs = [
    ['retry_suspend', retrySuspend],
    ['billing', billing],
    ['expiry', expiry],
    ['class_reminders', classReminders],
    ['reengagement', reengagement],
    ['daily_summary', dailySummary],
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
