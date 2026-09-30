// Member-portal router — /api/member/* .
import { json } from '../../server/lib/http.js';
import { guardRequest, MAX_PHOTO_BODY_BYTES } from '../../server/lib/guard.js';
import { adoptSessionCookie } from '../../server/lib/session-cookie.js';
import logout from '../../server/handlers/member/logout.js';
import { withGym } from '../../server/lib/gymcontext.js';
import { enforceEntitlement } from '../../server/lib/entitlements.js';
import { MEMBER_ROUTE_FEATURES } from '../../shared/features.js';
import { applyAppCors } from '../../shared/cors.js';
import { captureError } from '../../server/lib/observability.js';
import { checkLongSession } from '../../server/lib/sessions.js';
import { enforceMemberService } from '../../server/lib/member-services.js';
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
import pause from '../../server/handlers/member/pause.js';
import memberRewards from '../../server/handlers/member/rewards.js';
import memberChallenges from '../../server/handlers/member/challenges.js';
import family from '../../server/handlers/member/family.js';

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
  // The four member services (CLAUDE.md §41.1 Q3).
  pause,
  rewards: memberRewards,
  challenges: memberChallenges,
  family,
};

// Routes that carry face photos, a logo or a member import (server/lib/guard.js).
const PHOTO_ROUTES = new Set(['enroll-face', 'face-login']);
// The ways in: they open a session, so they never use the one in a cookie.
const SIGN_INS = new Set(['login', 'face-login']);

export default async function handler(req, res) {
  // The app's own member screens call these from its origin (shared/cors.js).
  if (applyAppCors(req, res)) return;
  const parts = new URL(req.url, 'http://localhost').pathname.split('/').filter(Boolean);
  const seg = parts[2];
  // Size and rate first, before any work is done (CLAUDE.md §46).
  if (!guardRequest(req, res, PHOTO_ROUTES.has(seg) ? { maxBytes: MAX_PHOTO_BODY_BYTES } : undefined)) return;
  // The website's session cookie, taken as the Bearer; a change it carries
  // must come from a Yoyo Gyms page (server/lib/session-cookie.js). Never on
  // a sign-in, which needs no session: an old cookie the server no longer
  // accepts must not stop someone signing in again.
  if (!SIGN_INS.has(seg) && !adoptSessionCookie(req, res, 'member', json)) return;
  if (seg === 'logout') return logout(req, res);
  const fn = routes[seg];
  if (!fn) return json(res, 404, { error: `Not found: /api/member/${seg || ''}` });
  // Plan gating, inside the gym's scope — see api/admin/[...path].js. The
  // member router had none, so a BASIC gym's members could use every
  // MEDIUM and PRIME feature the portal offers.
  try {
    return await withGym(
      req,
      res,
      // A long ("stay signed in") session is checked against the member's
      // current session_version first — the gym's "sign out everywhere".
      // Then the plan, then the owner's own choice of what they offer (§41).
      async () =>
        (await checkLongSession(req, res, 'member', json)) &&
        enforceEntitlement(seg, res, json, MEMBER_ROUTE_FEATURES, { forMembers: true }) &&
        (await enforceMemberService(seg, res, json))
          ? fn(req, res)
          : undefined,
      json
    );
  } catch (err) {
    captureError(`api/member/${seg}`, err, { method: req.method });
    if (!res.headersSent) return json(res, 500, { error: 'Something went wrong. Please try again.' });
  }
}
