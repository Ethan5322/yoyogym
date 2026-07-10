// POST /api/member/face-login  { image }  (preferred)  OR  { descriptor }  (legacy)
// Member portal alternative sign-in: verify by face.
//   - If the InsightFace service is configured AND an image is sent: embed with
//     ArcFace and match by cosine similarity (highest accuracy, any phone).
//   - Otherwise fall back to the in-browser face-api 128-D descriptor.
//
// Either way the probe is scored against each member's GALLERY of enrolled
// looks — their closest one wins — and acceptance needs both an absolute
// threshold and a clear margin over the runner-up member, so a look-alike can
// never sign in. On an unambiguous match that shows a new appearance (a
// haircut, a beard, makeup), the probe is learned as an extra template so the
// member does not slowly drift out of their own gallery.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, unauthorized, serverError } from '../../lib/http.js';
import { signMemberToken } from '../../lib/memberauth.js';
import { rateLimit } from '../../lib/ratelimit.js';
import { faceServiceConfigured, embedFace } from '../../lib/faceservice.js';
import {
  ARCFACE,
  FACEAPI,
  arcfaceSimilarity,
  faceApiSimilarity,
  templatesOf,
  identify,
  shouldLearn,
  withLearnedTemplate,
} from '../../lib/facematch.js';
import { selectFaceRows, updateFaceRow } from '../../lib/facedb.js';

const BASE = 'id, full_name, membership_number, status';

const ARCFACE_ENGINE = {
  tuning: ARCFACE,
  similarity: arcfaceSimilarity,
  legacyColumn: 'arcface_embedding',
  galleryColumn: 'arcface_templates',
  name: 'arcface',
};
const FACEAPI_ENGINE = {
  tuning: FACEAPI,
  similarity: faceApiSimilarity,
  legacyColumn: 'face_descriptor',
  galleryColumn: 'face_templates',
  name: 'face-api',
};

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  if (!(await rateLimit(req, res, { key: 'member-face-login', limit: 12, windowMs: 60_000 }))) return;

  try {
    const { image, descriptor } = await readJsonBody(req);
    const supabase = getSupabase();

    const useArcface = faceServiceConfigured() && typeof image === 'string' && image.startsWith('data:image');
    if (!useArcface && !(Array.isArray(descriptor) && descriptor.length >= 64)) {
      return badRequest(res, 'A valid face scan is required.');
    }
    const engine = useArcface ? ARCFACE_ENGINE : FACEAPI_ENGINE;
    const { tuning, similarity, legacyColumn, galleryColumn } = engine;

    const probe = useArcface ? await embedFace(image) : descriptor;
    if (!probe) return unauthorized(res, 'No face detected. Try again or use your membership number.');

    const { data: rows, error, degraded } = await selectFaceRows(supabase, 'members', {
      columns: `${BASE}, ${legacyColumn}, ${galleryColumn}`,
      legacyColumns: `${BASE}, ${legacyColumn}`,
      apply: (q) => q.not(legacyColumn, 'is', null),
    });
    if (error) return serverError(res, error.message);

    const people = (rows || []).map((row) => ({
      row,
      templates: templatesOf(row, { arrayKey: galleryColumn, legacyKey: legacyColumn }),
    }));

    const { person, score, confident } = identify(probe, people, {
      similarity,
      threshold: tuning.threshold,
      margin: tuning.margin,
    });
    if (!confident) {
      return unauthorized(res, 'Face not recognised. Use your membership number instead.');
    }
    const member = person.row;

    // Absorb appearance drift: only on a match well clear of the threshold, and
    // only when today's face adds something the gallery does not already hold.
    const canLearn =
      !degraded &&
      shouldLearn(probe, person.templates, {
        similarity,
        score,
        learnAbove: tuning.learnAbove,
        redundantAbove: tuning.redundantAbove,
      });
    if (canLearn) {
      // Best effort — a storage hiccup must never fail a valid login.
      // Seed from the stored gallery, or (for a member still on the legacy single
      // template) from that template so the original enrolment stays an anchor.
      const base = Array.isArray(member[galleryColumn]) && member[galleryColumn].length ? member[galleryColumn] : person.templates;
      const gallery = withLearnedTemplate(base, probe, { max: tuning.maxTemplates });
      const { error: learnErr } = await updateFaceRow(supabase, 'members', member.id, {
        [galleryColumn]: gallery,
        updated_at: new Date().toISOString(),
      });
      if (learnErr) console.error('face template learn failed:', learnErr.message);
    }

    return ok(res, {
      token: signMemberToken(member),
      member: {
        id: member.id,
        full_name: member.full_name,
        membership_number: member.membership_number,
        status: member.status,
      },
      engine: engine.name,
    });
  } catch (err) {
    console.error('member face-login error:', err.message);
    return serverError(res, 'Face login failed');
  }
}
