// POST /api/member/face-login  { image }  (preferred)  OR  { descriptor }  (legacy)
// Member portal alternative sign-in: verify by face.
//   - If the InsightFace service is configured AND an image is sent: embed with
//     ArcFace and match by cosine similarity against enrolled members (highest
//     accuracy, works on any phone).
//   - Otherwise fall back to the in-browser face-api 128-D descriptor (Euclidean).
// Corporate-grade either way: an absolute threshold AND a margin over the
// runner-up, so a look-alike can never sign in.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, unauthorized, serverError } from '../../lib/http.js';
import { signMemberToken } from '../../lib/memberauth.js';
import { rateLimit } from '../../lib/ratelimit.js';
import { faceServiceConfigured, embedFace, cosineSim, FACE_SIM_THRESHOLD, FACE_SIM_MARGIN } from '../../lib/faceservice.js';

const EUC_THRESHOLD = 0.6; // face-api fallback (Euclidean distance)
const EUC_MARGIN = 0.05;

function euclidean(a, b) {
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
  if (!(await rateLimit(req, res, { key: 'member-face-login', limit: 12, windowMs: 60_000 }))) return;

  try {
    const { image, descriptor } = await readJsonBody(req);
    const supabase = getSupabase();

    // ── Preferred: ArcFace via the InsightFace service ──────────────────────
    if (faceServiceConfigured() && typeof image === 'string' && image.startsWith('data:image')) {
      const probe = await embedFace(image);
      if (!probe) return unauthorized(res, 'No face detected. Try again or use your membership number.');

      const { data: members, error } = await supabase
        .from('members')
        .select('id, full_name, membership_number, status, arcface_embedding')
        .not('arcface_embedding', 'is', null);
      if (error) return serverError(res, error.message);

      let best = null;
      let bestSim = -1;
      let second = -1;
      for (const m of members || []) {
        const s = cosineSim(probe, m.arcface_embedding);
        if (s > bestSim) { second = bestSim; bestSim = s; best = m; }
        else if (s > second) second = s;
      }
      if (!best || bestSim < FACE_SIM_THRESHOLD || bestSim - second < FACE_SIM_MARGIN) {
        return unauthorized(res, 'Face not recognised. Use your membership number instead.');
      }
      return ok(res, {
        token: signMemberToken(best),
        member: { id: best.id, full_name: best.full_name, membership_number: best.membership_number, status: best.status },
        engine: 'arcface',
      });
    }

    // ── Fallback: in-browser face-api 128-D descriptor ──────────────────────
    if (!Array.isArray(descriptor) || descriptor.length < 64) {
      return badRequest(res, 'A valid face scan is required.');
    }
    const { data: members, error } = await supabase
      .from('members')
      .select('id, full_name, membership_number, status, face_descriptor')
      .not('face_descriptor', 'is', null);
    if (error) return serverError(res, error.message);

    let best = null;
    let bestDist = Infinity;
    let second = Infinity;
    for (const m of members || []) {
      const d = euclidean(descriptor, m.face_descriptor);
      if (d < bestDist) { second = bestDist; bestDist = d; best = m; }
      else if (d < second) second = d;
    }
    if (!best || bestDist >= EUC_THRESHOLD || second - bestDist < EUC_MARGIN) {
      return unauthorized(res, 'Face not recognised. Use your membership number instead.');
    }
    return ok(res, {
      token: signMemberToken(best),
      member: { id: best.id, full_name: best.full_name, membership_number: best.membership_number, status: best.status },
      engine: 'face-api',
    });
  } catch (err) {
    console.error('member face-login error:', err.message);
    return serverError(res, 'Face login failed');
  }
}
