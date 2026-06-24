// Auth router — /api/auth/* (login, me).
import { json } from '../../server/lib/http.js';
import login from '../../server/handlers/auth/login.js';
import me from '../../server/handlers/auth/me.js';
import faceLogin from '../../server/handlers/auth/face-login.js';

const routes = { login, me, 'face-login': faceLogin };

export default function handler(req, res) {
  const parts = new URL(req.url, 'http://localhost').pathname.split('/').filter(Boolean);
  const seg = parts[2];
  const fn = routes[seg];
  if (!fn) return json(res, 404, { error: `Not found: /api/auth/${seg || ''}` });
  return fn(req, res);
}
