// Admin router — /api/admin/* . Routes by first path segment to the handler in
// api/_handlers/admin/** (kept out of the function count via the _ prefix).
import { json } from '../_lib/http.js';
import dashboard from '../_handlers/admin/dashboard.js';
import verify from '../_handlers/admin/verify.js';
import members from '../_handlers/admin/members.js';
import member from '../_handlers/admin/member.js';
import memberAction from '../_handlers/admin/member-action.js';
import today from '../_handlers/admin/today.js';
import classes from '../_handlers/admin/classes.js';
import classBookings from '../_handlers/admin/class-bookings.js';
import trainers from '../_handlers/admin/trainers.js';
import payments from '../_handlers/admin/payments.js';
import analytics from '../_handlers/admin/analytics.js';
import broadcast from '../_handlers/admin/broadcast.js';
import plans from '../_handlers/admin/plans.js';
import addons from '../_handlers/admin/addons.js';
import settings from '../_handlers/admin/settings.js';
import qrStats from '../_handlers/admin/qr-stats.js';
import events from '../_handlers/admin/events.js';
import clients from '../_handlers/admin/clients.js';
import trainingSession from '../_handlers/admin/training-session.js';

const routes = {
  dashboard,
  verify,
  members,
  member,
  'member-action': memberAction,
  today,
  classes,
  'class-bookings': classBookings,
  trainers,
  payments,
  analytics,
  broadcast,
  plans,
  addons,
  settings,
  'qr-stats': qrStats,
  events,
  clients,
  'training-session': trainingSession,
};

export default function handler(req, res) {
  const seg = (req.query?.path || [])[0];
  const fn = routes[seg];
  if (!fn) return json(res, 404, { error: `Not found: /api/admin/${seg || ''}` });
  return fn(req, res);
}
