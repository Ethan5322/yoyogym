// Cron router — /api/cron/* (daily orchestrator + individual jobs).
import { json } from '../_lib/http.js';
import daily from '../_handlers/cron/daily.js';
import billing from '../_handlers/cron/billing.js';
import retrySuspend from '../_handlers/cron/retry-suspend.js';
import expiry from '../_handlers/cron/expiry.js';
import classReminders from '../_handlers/cron/class-reminders.js';
import dailySummary from '../_handlers/cron/daily-summary.js';
import reengagement from '../_handlers/cron/reengagement.js';

const routes = {
  daily,
  billing,
  'retry-suspend': retrySuspend,
  expiry,
  'class-reminders': classReminders,
  'daily-summary': dailySummary,
  reengagement,
};

export default function handler(req, res) {
  const parts = new URL(req.url, 'http://localhost').pathname.split('/').filter(Boolean);
  const seg = parts[2];
  const fn = routes[seg];
  if (!fn) return json(res, 404, { error: `Not found: /api/cron/${seg || ''}` });
  return fn(req, res);
}
