// Member-portal router — /api/member/* .
import { json } from '../../server/lib/http.js';
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
import pay from '../../server/handlers/member/pay.js';
import message from '../../server/handlers/member/message.js';
import messages from '../../server/handlers/member/messages.js';
import requestPlanChange from '../../server/handlers/member/request-plan-change.js';
import profile from '../../server/handlers/member/profile.js';

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
  pay,
  message,
  messages,
  'request-plan-change': requestPlanChange,
  profile,
};

export default async function handler(req, res) {
  const parts = new URL(req.url, 'http://localhost').pathname.split('/').filter(Boolean);
  const seg = parts[2];
  const fn = routes[seg];
  if (!fn) return json(res, 404, { error: `Not found: /api/member/${seg || ''}` });
  try {
    return await fn(req, res);
  } catch (err) {
    captureError(`api/member/${seg}`, err, { method: req.method });
    if (!res.headersSent) return json(res, 500, { error: 'Something went wrong. Please try again.' });
  }
}
