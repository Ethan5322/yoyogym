// Member-portal router — /api/member/* .
import { json } from '../../server/lib/http.js';
import login from '../../server/handlers/member/login.js';
import status from '../../server/handlers/member/status.js';
import checkin from '../../server/handlers/member/checkin.js';
import classes from '../../server/handlers/member/classes.js';
import bookClass from '../../server/handlers/member/book-class.js';
import history from '../../server/handlers/member/history.js';
import requestDeletion from '../../server/handlers/member/request-deletion.js';

const routes = {
  login,
  status,
  checkin,
  classes,
  'book-class': bookClass,
  history,
  'request-deletion': requestDeletion,
};

export default function handler(req, res) {
  const parts = new URL(req.url, 'http://localhost').pathname.split('/').filter(Boolean);
  const seg = parts[2];
  const fn = routes[seg];
  if (!fn) return json(res, 404, { error: `Not found: /api/member/${seg || ''}` });
  return fn(req, res);
}
