// POST /api/admin/face-learn  { type: 'member', id, descriptor }
//
// The door scanner's half of "the system remembers a face, however long".
//
// ============================================================================
// Why this exists
// ============================================================================
//
// A member's gallery keeps the enrolment photos as permanent ANCHORS and a
// rolling window of LEARNED appearances, so it follows a haircut, a beard or
// the years (server/lib/facematch.js). But learning only happened when a
// member signed in by face on their own phone. The reception door scanner —
// where most members are recognised, every visit — matched and learned
// nothing, so for most members the gallery froze at enrolment and recognition
// slowly grew less sure.
//
// ============================================================================
// Why the server decides, not the scanner
// ============================================================================
//
// The scanner matches in the browser. If this endpoint learned whatever face
// it was sent "for member X", anyone with a reception login could plant their
// own face on someone else's record and walk in as them. So the scanner only
// SUGGESTS who it saw. The server identifies the probe itself, against every
// member, with the same threshold, margin and learn-above rules as face
// sign-in — and learns ONLY if its own answer is the same member and the
// match is well clear of the line. Anything else is quietly not learned.
//
// Never an error for "not learned": the check-in has already happened, and a
// learning step must never be what a receptionist has to deal with.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError } from '../../lib/http.js';
import { requireRole } from '../../lib/auth.js';
import { rateLimit } from '../../lib/ratelimit.js';
import {
  FACEAPI,
  faceApiSimilarity,
  templatesOf,
  identify,
  shouldLearn,
  withLearnedTemplate,
} from '../../lib/facematch.js';
import { selectFaceRows, updateFaceRow } from '../../lib/facedb.js';

const BASE = 'id';
const LEGACY = 'face_descriptor';
const GALLERY = 'face_templates';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  const admin = requireRole(req, res, ['owner', 'manager', 'reception']);
  if (!admin) return;
  if (!(await rateLimit(req, res, { key: 'face-learn', limit: 30, windowMs: 60_000 }))) return;

  try {
    const { type, id, descriptor } = await readJsonBody(req);
    if (type !== 'member') return ok(res, { learned: false, reason: 'members only' });
    if (!id || !Array.isArray(descriptor) || descriptor.length < 64 || !descriptor.every(Number.isFinite)) {
      return badRequest(res, 'A face reading and a member are required.');
    }

    const supabase = getSupabase();
    const { data: rows, error, degraded } = await selectFaceRows(supabase, 'members', {
      columns: `${BASE}, ${LEGACY}, ${GALLERY}`,
      legacyColumns: `${BASE}, ${LEGACY}`,
      apply: (q) => q.not(LEGACY, 'is', null),
    });
    if (error) return serverError(res, error.message);
    // No gallery column yet (migration not run): nowhere to learn into.
    if (degraded) return ok(res, { learned: false, reason: 'gallery unavailable' });

    const people = (rows || []).map((row) => ({
      row,
      templates: templatesOf(row, { arrayKey: GALLERY, legacyKey: LEGACY }),
    }));

    // THE SERVER'S OWN ANSWER — the scanner's suggestion is only compared to it.
    const { person, score, confident } = identify(descriptor, people, {
      similarity: faceApiSimilarity,
      threshold: FACEAPI.threshold,
      margin: FACEAPI.margin,
    });
    if (!confident || person.row.id !== id) {
      return ok(res, { learned: false, reason: 'not confirmed' });
    }

    const learn = shouldLearn(descriptor, person.templates, {
      similarity: faceApiSimilarity,
      score,
      learnAbove: FACEAPI.learnAbove,
      redundantAbove: FACEAPI.redundantAbove,
    });
    if (!learn) return ok(res, { learned: false, reason: 'nothing new' });

    // Seeded from the stored gallery, or from the legacy single template so
    // the original enrolment stays an anchor.
    const stored = person.row[GALLERY];
    const base = Array.isArray(stored) && stored.length ? stored : person.templates;
    const gallery = withLearnedTemplate(base, descriptor, { max: FACEAPI.maxTemplates });

    const { error: writeErr } = await updateFaceRow(supabase, 'members', id, {
      [GALLERY]: gallery,
      updated_at: new Date().toISOString(),
    });
    if (writeErr) {
      console.error('door-scan face learn failed:', writeErr.message);
      return ok(res, { learned: false, reason: 'not saved' });
    }
    return ok(res, { learned: true });
  } catch (err) {
    console.error('face-learn error:', err.message);
    return ok(res, { learned: false, reason: 'error' });
  }
}
