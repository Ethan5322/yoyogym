// Auth router — /api/auth/* (login, me).
import { json } from '../_lib/http.js';
import login from '../_handlers/auth/login.js';
import me from '../_handlers/auth/me.js';

const routes = { login, me };

export default function handler(req, res) {
  const parts = new URL(req.url, 'http://localhost').pathname.split('/').filter(Boolean);
  const seg = parts[2]; // api / auth / <seg>
  const fn = routes[seg];
  if (!fn) return json(res, 404, { error: `Not found: /api/auth/${seg || ''}` });
  return fn(req, res);
}
