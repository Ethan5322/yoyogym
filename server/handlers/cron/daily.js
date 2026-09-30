// MORNING cron orchestrator (runs 06:00 daily — see vercel.json).
// Runs the day's maintenance automations in sequence. Each job is isolated so
// one failure does not stop the others. Two jobs run on their own schedules and
// are deliberately excluded here: daily-summary (20:00) and weekly-schedule
// (Mon 07:00). All individual endpoints remain callable manually / via an
// external scheduler if you move to more granular hourly timing on Vercel Pro.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, ok } from '../../lib/http.js';
import { authorizeCron } from '../../lib/cron.js';
import { run as suspendOverdue } from './suspend-overdue.js';
import { runReminders as billingReminders } from './billing.js';
import { run as expiry } from './expiry.js';
import { run as classReminders } from './class-reminders.js';
import { run as reengagement } from './reengagement.js';
import { run as resumePauses } from './resume-pauses.js';
import { run as eraseRequested } from './erase-requested.js';
// NOTE: daily_summary runs on its own 8 PM schedule (spec Part 5 #10), so it is
// intentionally NOT included in this morning orchestrator.

/** The morning's jobs for ONE gym (the router runs this for every gym). */
export async function runDaily(supabase) {
  const jobs = [
    ['suspend_overdue', suspendOverdue],
    ['billing_reminders', billingReminders],
    ['expiry', expiry],
    ['class_reminders', classReminders],
    ['reengagement', reengagement],
    // A pause ends on its last day without anyone remembering (§41.1 Q3).
    ['resume_pauses', resumePauses],
    // A member's "Delete my account" is finished within 30 days (§46.1 Q3).
    ['erase_requested', eraseRequested],
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
  return results;
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;
  if (!authorizeCron(req, res)) return;
  return ok(res, { ran: true, at: new Date().toISOString(), results: await runDaily(getSupabase()) });
}
