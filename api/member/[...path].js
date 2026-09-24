// Member-portal router — /api/member/* .
import { json } from '../../server/lib/http.js';
import { withGym } from '../../server/lib/gymcontext.js';
import { enforceEntitlement } from '../../server/lib/entitlements.js';
import { MEMBER_ROUTE_FEATURES } from '../../shared/features.js';
import { applyAppCors } from '../../shared/cors.js';
import { captureError } from '../../server/lib/observability.js';
import login from '../../server/handlers/member/login.js';
import faceLogin from '../../server/handlers/member/face-login.js';
import status from '../../server/handlers/member/status.js';
import checkin from '../../server/handlers/member/checkin.js';
import classes from '../../server/handlers/member/classes.js';
import bookClass from '../../server/handlers/member/book-class.js';
import cancelBooking from '../../server/handlers/member/cancel-booking.js';
import history from '../../server/handlers/member/history.js';
import requestDeletion from '../../server/handlers/member/request-deletion.js';
import message from '../../server/handlers/member/message.js';
import messages from '../../server/handlers/member/messages.js';
import requestPlanChange from '../../server/handlers/member/request-plan-change.js';
import profile from '../../server/handlers/member/profile.js';
import announcements from '../../server/handlers/member/announcements.js';
import progress from '../../server/handlers/member/progress.js';
import refer from '../../server/handlers/member/refer.js';
import enrollFace from '../../server/handlers/member/enroll-face.js';

const routes = {
  login,
  'face-login': faceLogin,
  status,
  checkin,
  classes,
  'book-class': bookClass,
  'cancel-booking': cancelBooking,
  history,
  'request-deletion': requestDeletion,
  message,
  messages,
  'request-plan-change': requestPlanChange,
  profile,
  announcements,
  progress,
  refer,
  'enroll-face': enrollFace,
};

export default async function handler(req, res) {
  // The app's own member screens call these from its origin (shared/cors.js).
  if (applyAppCors(req, res)) return;
  const parts = new URL(req.url, 'http://localhost').pathname.split('/').filter(Boolean);
  const seg = parts[2];
  const fn = routes[seg];
  if (!fn) return json(res, 404, { error: `Not found: /api/member/${seg || ''}` });
  // Plan gating, inside the gym's scope — see api/admin/[...path].js. The
  // member router had none, so a BASIC gym's members could use every
  // MEDIUM and PRIME feature the portal offers.
  try {
    return await withGym(
      req,
      res,
      () =>
        enforceEntitlement(seg, res, json, MEMBER_ROUTE_FEATURES, { forMembers: true }) ? fn(req, res) : undefined,
      json
    );
  } catch (err) {
    captureError(`api/member/${seg}`, err, { method: req.method });
    if (!res.headersSent) return json(res, 500, { error: 'Something went wrong. Please try again.' });
  }
}
