// Cron router — /api/cron/* (daily orchestrator + individual jobs).
import { json } from '../../server/lib/http.js';
import daily from '../../server/handlers/cron/daily.js';
import billing from '../../server/handlers/cron/billing.js';
import retrySuspend from '../../server/handlers/cron/retry-suspend.js';
import expiry from '../../server/handlers/cron/expiry.js';
import classReminders from '../../server/handlers/cron/class-reminders.js';
import dailySummary from '../../server/handlers/cron/daily-summary.js';
import reengagement from '../../server/handlers/cron/reengagement.js';
import attendanceAlerts from '../../server/handlers/cron/attendance-alerts.js';
import weeklySchedule from '../../server/handlers/cron/weekly-schedule.js';

const routes = {
  daily,
  billing,
  'retry-suspend': retrySuspend,
  expiry,
  'class-reminders': classReminders,
  'daily-summary': dailySummary,
  reengagement,
  'attendance-alerts': attendanceAlerts,
  'weekly-schedule': weeklySchedule,
};

export default function handler(req, res) {
  const parts = new URL(req.url, 'http://localhost').pathname.split('/').filter(Boolean);
  const seg = parts[2];
  const fn = routes[seg];
  if (!fn) return json(res, 404, { error: `Not found: /api/cron/${seg || ''}` });
  return fn(req, res);
}
