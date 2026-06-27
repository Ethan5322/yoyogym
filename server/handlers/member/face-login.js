// POST /api/member/face-login  { descriptor }  -> { token, member }
// Member portal alternative sign-in: verify by face. Matches the supplied
// descriptor against enrolled member faces server-side and issues a member JWT
// on a confident match. Corporate-grade: requires both an absolute threshold
// AND a clear margin over the runner-up, so a look-alike can never sign in.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, unauthorized, serverError } from '../../lib/http.js';
import { signMemberToken } from '../../lib/memberauth.js';
import { rateLimit } from '../../lib/ratelimit.js';

const THRESHOLD = 0.48; // absolute max Euclidean distance for a match
const MARGIN = 0.06;    // best must beat the runner-up by at least this much

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
  if (!(await rateLimit(req, res, { key: 'member-face-login', limit: 10, windowMs: 60_000 }))) return;

  try {
    const { descriptor } = await readJsonBody(req);
    if (!Array.isArray(descriptor) || descriptor.length < 64) {
      return badRequest(res, 'A valid face scan is required.');
    }

    const supabase = getSupabase();
    const { data: members, error } = await supabase
      .from('members')
      .select('id, full_name, membership_number, status, face_descriptor')
      .not('face_descriptor', 'is', null);
    if (error) return serverError(res, error.message);

    let best = null;
    let bestDist = Infinity;
    let second = Infinity;
    for (const m of members || []) {
      const d = distance(descriptor, m.face_descriptor);
      if (d < bestDist) {
        second = bestDist;
        bestDist = d;
        best = m;
      } else if (d < second) {
        second = d;
      }
    }

    if (!best || bestDist >= THRESHOLD || second - bestDist < MARGIN) {
      return unauthorized(res, 'Face not recognised. Use your membership number instead.');
    }

    return ok(res, {
      token: signMemberToken(best),
      member: {
        id: best.id,
        full_name: best.full_name,
        membership_number: best.membership_number,
        status: best.status,
      },
    });
  } catch (err) {
    console.error('member face-login error:', err.message);
    return serverError(res, 'Face login failed');
  }
}
