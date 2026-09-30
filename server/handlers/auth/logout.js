// POST /api/auth/logout — sign out of this gym's admin panel on this browser
// (CLAUDE.md §46.1 Q1). The session is an HttpOnly cookie, which no script
// can remove, so the page asks the server to.
import { allowMethods, ok } from '../../lib/http.js';
import { clearSessionCookie } from '../../lib/session-cookie.js';

export default function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  clearSessionCookie(req, res, 'admin');
  return ok(res, { signed_out: true });
}
