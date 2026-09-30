// Auth router — /api/auth/* (login, me).
import { json } from '../../server/lib/http.js';
import { guardRequest, MAX_PHOTO_BODY_BYTES } from '../../server/lib/guard.js';
import { withGym } from '../../server/lib/gymcontext.js';
import { enforceEntitlement } from '../../server/lib/entitlements.js';
import { AUTH_ROUTE_FEATURES } from '../../shared/features.js';
import { captureError } from '../../server/lib/observability.js';
import { checkLongSession } from '../../server/lib/sessions.js';
import login from '../../server/handlers/auth/login.js';
import me from '../../server/handlers/auth/me.js';
import faceLogin from '../../server/handlers/auth/face-login.js';
import changePassword from '../../server/handlers/auth/change-password.js';
import ownerLogin from '../../server/handlers/auth/owner-login.js';

const routes = { login, me, 'face-login': faceLogin, 'change-password': changePassword };

// Routes that carry face photos, a logo or a member import (server/lib/guard.js).
const PHOTO_ROUTES = new Set(['face-login']);

export default async function handler(req, res) {
  const parts = new URL(req.url, 'http://localhost').pathname.split('/').filter(Boolean);
  const seg = parts[2];
  // An owner signing in by email names no gym: it finds their gym itself, and
  // then runs that gym's own sign-in inside its scope (CLAUDE.md §43.1 Q2).
  if (seg === 'owner-login') {
    try {
      return await ownerLogin(req, res);
    } catch (err) {
      captureError('api/auth/owner-login', err, { method: req.method });
      if (!res.headersSent) return json(res, 500, { error: 'Something went wrong. Please try again.' });
      return undefined;
    }
  }
  const fn = routes[seg];
  if (!fn) return json(res, 404, { error: `Not found: /api/auth/${seg || ''}` });
  // Size and rate first, before any work is done (CLAUDE.md §46).
  if (!guardRequest(req, res, PHOTO_ROUTES.has(seg) ? { maxBytes: MAX_PHOTO_BODY_BYTES } : undefined)) return;
  // Plan gating inside the gym's scope: staff face sign-in is PRIME.
  try {
    return await withGym(
      req,
      res,
      async () =>
        (await checkLongSession(req, res, 'admin', json)) && enforceEntitlement(seg, res, json, AUTH_ROUTE_FEATURES)
          ? fn(req, res)
          : undefined,
      json
    );
  } catch (err) {
    captureError(`api/auth/${seg}`, err, { method: req.method });
    if (!res.headersSent) return json(res, 500, { error: 'Something went wrong. Please try again.' });
  }
}
