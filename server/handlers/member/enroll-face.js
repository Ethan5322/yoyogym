// POST /api/member/enroll-face  { descriptors?, images?, descriptor?, image? }
// Lets a signed-in member (re)enrol their own face for face login / access.
//
// Enrolment stores a GALLERY of templates captured across several poses rather
// than one averaged template. A single template freezes one hairstyle, one
// beard, one face of makeup; a gallery gives the matcher several looks of the
// same person to compare against, and adaptive learning at login time keeps it
// current as the member's appearance drifts.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError } from '../../lib/http.js';
import { authenticateMember } from '../../lib/memberauth.js';
import { faceServiceConfigured, embedEnrolmentImages } from '../../lib/faceservice.js';
import { enrolmentGallery } from '../../lib/facematch.js';
import { updateFaceRow } from '../../lib/facedb.js';

const isImage = (v) => typeof v === 'string' && v.startsWith('data:image');
const isVector = (v) => Array.isArray(v) && v.length >= 64;

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  const auth = authenticateMember(req, res);
  if (!auth) return;

  try {
    const body = await readJsonBody(req);
    // One entry per captured pose. Older clients send a single `descriptor` /
    // `image`; both shapes are accepted.
    const descriptors = (Array.isArray(body.descriptors) ? body.descriptors : [body.descriptor]).filter(isVector);
    const images = (Array.isArray(body.images) ? body.images : [body.image]).filter(isImage);

    if (!descriptors.length && !images.length) {
      return badRequest(res, 'A valid face scan is required.');
    }

    const patch = { biometric_enrolled: true, updated_at: new Date().toISOString() };

    if (descriptors.length) {
      // Legacy face-api fallback: the first pose stays in the old column so an
      // un-migrated tenant still matches; the full set goes to the gallery.
      patch.face_descriptor = descriptors[0];
      patch.face_templates = enrolmentGallery(descriptors);
    }
    if (images.length) patch.photo_url = images[0];

    // High-accuracy ArcFace embeddings (preferred) when the service is configured.
    if (faceServiceConfigured() && images.length) {
      const embeddings = await embedEnrolmentImages(images);
      if (!embeddings.length && !descriptors.length) {
        return badRequest(res, 'No clear face detected — try again in better lighting.');
      }
      if (embeddings.length) {
        patch.arcface_embedding = embeddings[0]; // legacy single-template column
        patch.arcface_templates = enrolmentGallery(embeddings);
      }
    }

    const supabase = getSupabase();
    const { error } = await updateFaceRow(supabase, 'members', auth.sub, patch);
    if (error) return serverError(res, error.message);

    return ok(res, {
      enrolled: true,
      arcface: !!patch.arcface_templates,
      templates: (patch.arcface_templates || patch.face_templates || []).length,
      message: 'Your face scan has been updated.',
    });
  } catch (err) {
    console.error('member enroll-face error:', err.message);
    return serverError(res, 'Could not save your face scan');
  }
}
