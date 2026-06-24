// Admin router — /api/admin/* . Resolves the route from req.url; logic lives in
// /server/handlers/admin (outside /api, so not counted as functions).
import { json } from '../../server/lib/http.js';
import dashboard from '../../server/handlers/admin/dashboard.js';
import verify from '../../server/handlers/admin/verify.js';
import members from '../../server/handlers/admin/members.js';
import member from '../../server/handlers/admin/member.js';
import memberAction from '../../server/handlers/admin/member-action.js';
import today from '../../server/handlers/admin/today.js';
import classes from '../../server/handlers/admin/classes.js';
import classBookings from '../../server/handlers/admin/class-bookings.js';
import trainers from '../../server/handlers/admin/trainers.js';
import payments from '../../server/handlers/admin/payments.js';
import analytics from '../../server/handlers/admin/analytics.js';
import broadcast from '../../server/handlers/admin/broadcast.js';
import plans from '../../server/handlers/admin/plans.js';
import addons from '../../server/handlers/admin/addons.js';
import settings from '../../server/handlers/admin/settings.js';
import qrStats from '../../server/handlers/admin/qr-stats.js';
import events from '../../server/handlers/admin/events.js';
import clients from '../../server/handlers/admin/clients.js';
import trainingSession from '../../server/handlers/admin/training-session.js';
import faceDescriptors from '../../server/handlers/admin/face-descriptors.js';
import accessCard from '../../server/handlers/admin/access-card.js';
import accessAction from '../../server/handlers/admin/access-action.js';
import attendanceLive from '../../server/handlers/admin/attendance-live.js';
import attendanceReport from '../../server/handlers/admin/attendance-report.js';

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
  'face-descriptors': faceDescriptors,
  'access-card': accessCard,
  'access-action': accessAction,
  'attendance-live': attendanceLive,
  'attendance-report': attendanceReport,
};

export default function handler(req, res) {
  const parts = new URL(req.url, 'http://localhost').pathname.split('/').filter(Boolean);
  const seg = parts[2];
  const fn = routes[seg];
  if (!fn) return json(res, 404, { error: `Not found: /api/admin/${seg || ''}` });
  return fn(req, res);
}
