// POST /api/auth/face-login  { descriptor }  (browser)  OR  { image }  (ArcFace)
//   -> { token, user }
// Type C admin gate — verify by face. Matches the probe against each enrolled
// admin's GALLERY of looks and issues a JWT on a confident match.
//
// Admin thresholds are stricter than member ones (a false accept here is an
// authorisation breach, not a turnstile mistake) and there is deliberately NO
// adaptive learning: an authorisation gate must not quietly rewrite its own
// templates. Admins re-enrol from Settings if their appearance changes a lot.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, unauthorized, serverError } from '../../lib/http.js';
import { signToken } from '../../lib/auth.js';
import { rateLimit } from '../../lib/ratelimit.js';
import { faceServiceConfigured, embedFace } from '../../lib/faceservice.js';
import { ARCFACE, FACEAPI, arcfaceSimilarity, faceApiSimilarity, templatesOf, identify } from '../../lib/facematch.js';
import { selectFaceRows } from '../../lib/facedb.js';

const BASE = 'id, username, full_name, email, role, trainer_id, is_active';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  if (!(await rateLimit(req, res, { key: 'face-login', limit: 10, windowMs: 60_000 }))) return;

  try {
    const { descriptor, image } = await readJsonBody(req);
    const supabase = getSupabase();

    const useArcface = faceServiceConfigured() && typeof image === 'string' && image.startsWith('data:image');
    if (!useArcface && !(Array.isArray(descriptor) && descriptor.length >= 64)) {
      return badRequest(res, 'A valid face descriptor is required.');
    }

    const [tuning, similarity, legacyColumn, galleryColumn] = useArcface
      ? [ARCFACE, arcfaceSimilarity, 'arcface_embedding', 'arcface_templates']
      : [FACEAPI, faceApiSimilarity, 'face_descriptor', 'face_templates'];

    const probe = useArcface ? await embedFace(image) : descriptor;
    if (!probe) return unauthorized(res, 'Face not recognised. Use your password instead.');

    const { data: rows, error } = await selectFaceRows(supabase, 'admin_users', {
      columns: `${BASE}, ${legacyColumn}, ${galleryColumn}`,
      legacyColumns: `${BASE}, ${legacyColumn}`,
      apply: (q) => q.not(legacyColumn, 'is', null).eq('is_active', true),
    });
    if (error) return serverError(res, error.message);

    const people = (rows || []).map((row) => ({
      row,
      templates: templatesOf(row, { arrayKey: galleryColumn, legacyKey: legacyColumn }),
    }));

    // Stricter admin operating point: higher absolute bar AND a wider margin, so
    // a look-alike can never unlock the admin panel.
    const { person, confident } = identify(probe, people, {
      similarity,
      threshold: tuning.adminThreshold,
      margin: tuning.adminMargin,
    });
    if (!confident) {
      return unauthorized(res, 'Face not recognised. Use your password instead.');
    }
    const best = person.row;

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
