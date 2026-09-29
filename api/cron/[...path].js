// Cron router — /api/cron/* (daily orchestrator + individual jobs).
import { json, ok, allowMethods } from '../../server/lib/http.js';
import { withGym } from '../../server/lib/gymcontext.js';
import { authorizeCron } from '../../server/lib/cron.js';
import { forEveryGym } from '../../server/lib/every-gym.js';
import { captureError } from '../../server/lib/observability.js';
import daily, { runDaily } from '../../server/handlers/cron/daily.js';
import billing, { runReminders } from '../../server/handlers/cron/billing.js';
import suspendOverdue, { run as runSuspendOverdue } from '../../server/handlers/cron/suspend-overdue.js';
import expiry, { run as runExpiry } from '../../server/handlers/cron/expiry.js';
import classReminders, { run as runClassReminders } from '../../server/handlers/cron/class-reminders.js';
import dailySummary, { run as runDailySummary } from '../../server/handlers/cron/daily-summary.js';
import reengagement, { run as runReengagement } from '../../server/handlers/cron/reengagement.js';
import attendanceAlerts, { run as runAttendanceAlerts } from '../../server/handlers/cron/attendance-alerts.js';
import weeklySchedule, { run as runWeeklySchedule } from '../../server/handlers/cron/weekly-schedule.js';

const routes = {
  daily,
  billing,
  'suspend-overdue': suspendOverdue,
  expiry,
  'class-reminders': classReminders,
  'daily-summary': dailySummary,
  reengagement,
  'attendance-alerts': attendanceAlerts,
  'weekly-schedule': weeklySchedule,
};

// What each job does for ONE gym. A scheduled call names no gym, and runs the
// job for EVERY gym open for business, each inside its own schema — it used to
// run for the deployment's own gym only, so no other gym's memberships ever
// expired (server/lib/every-gym.js).
const perGym = {
  daily: runDaily,
  billing: runReminders,
  'suspend-overdue': runSuspendOverdue,
  expiry: runExpiry,
  'class-reminders': runClassReminders,
  'daily-summary': runDailySummary,
  reengagement: runReengagement,
  'attendance-alerts': runAttendanceAlerts,
  'weekly-schedule': runWeeklySchedule,
};

export default async function handler(req, res) {
  const parts = new URL(req.url, 'http://localhost').pathname.split('/').filter(Boolean);
  const seg = parts[2];
  const fn = routes[seg];
  if (!fn) return json(res, 404, { error: `Not found: /api/cron/${seg || ''}` });
  try {
    // A call that names a gym runs for that gym alone, as before.
    if (!req.headers?.['x-gym-slug'] && perGym[seg]) {
      if (!allowMethods(req, res, ['GET', 'POST'])) return;
      if (!authorizeCron(req, res)) return;
      const gyms = await forEveryGym(perGym[seg]);
      return ok(res, { ran: true, at: new Date().toISOString(), gyms });
    }
    return await withGym(req, res, () => fn(req, res), json);
  } catch (err) {
    captureError(`api/cron/${seg}`, err, { method: req.method });
    if (!res.headersSent) return json(res, 500, { error: 'Cron run failed.' });
  }
}
