// POST /api/auth/face-login  { descriptor }  -> { token, user }
// Type C admin gate — verify by face. Matches the supplied descriptor against
// enrolled admin faces server-side and issues a JWT on a confident match.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, unauthorized, serverError } from '../../lib/http.js';
import { signToken } from '../../lib/auth.js';
import { rateLimit } from '../../lib/ratelimit.js';

const THRESHOLD = 0.55; // a little stricter than member matching, for admin login

function distance(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s);
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  if (!(await rateLimit(req, res, { key: 'face-login', limit: 10, windowMs: 60_000 }))) return;

  try {
    const { descriptor } = await readJsonBody(req);
    if (!Array.isArray(descriptor) || descriptor.length < 64) {
      return badRequest(res, 'A valid face descriptor is required.');
    }

    const supabase = getSupabase();
    const { data: admins, error } = await supabase
      .from('admin_users')
      .select('id, username, full_name, email, role, trainer_id, is_active, face_descriptor')
      .not('face_descriptor', 'is', null)
      .eq('is_active', true);
    if (error) return serverError(res, error.message);

    let best = null;
    let bestDist = Infinity;
    let second = Infinity;
    for (const a of admins || []) {
      const d = distance(descriptor, a.face_descriptor);
      if (d < bestDist) {
        second = bestDist;
        bestDist = d;
        best = a;
      } else if (d < second) {
        second = d;
      }
    }

    // Require a confident match: under threshold AND clearly better than the
    // runner-up (margin) so a look-alike can never unlock the admin panel.
    if (!best || bestDist >= THRESHOLD || second - bestDist < 0.05) {
      return unauthorized(res, 'Face not recognised. Use your password instead.');
    }

    await supabase.from('admin_users').update({ last_login_at: new Date().toISOString() }).eq('id', best.id);
    const token = signToken(best);
    return ok(res, {
      token,
      user: { id: best.id, username: best.username, full_name: best.full_name, email: best.email, role: best.role, trainer_id: best.trainer_id },
    });
  } catch (err) {
    console.error('face-login error:', err.message);
    return serverError(res, 'Face login failed');
  }
}
