// Auth router — /api/auth/* (login, me).
import { json } from '../../server/lib/http.js';
import { captureError } from '../../server/lib/observability.js';
import login from '../../server/handlers/auth/login.js';
import me from '../../server/handlers/auth/me.js';
import faceLogin from '../../server/handlers/auth/face-login.js';
import changePassword from '../../server/handlers/auth/change-password.js';

const routes = { login, me, 'face-login': faceLogin, 'change-password': changePassword };

export default async function handler(req, res) {
  const parts = new URL(req.url, 'http://localhost').pathname.split('/').filter(Boolean);
  const seg = parts[2];
  const fn = routes[seg];
  if (!fn) return json(res, 404, { error: `Not found: /api/auth/${seg || ''}` });
  try {
    return await fn(req, res);
  } catch (err) {
    captureError(`api/auth/${seg}`, err, { method: req.method });
    if (!res.headersSent) return json(res, 500, { error: 'Something went wrong. Please try again.' });
  }
}
