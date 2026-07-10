// POST /api/admin/enroll-face  { descriptors?, images?, descriptor?, image? }
// (Type C admin face login enrolment)
// Stores the signed-in admin's face gallery so they can later log in by face.
// Any authenticated admin may enrol their own face.
//
// As with member enrolment, several poses are stored rather than one averaged
// template: a frozen single template stops matching once the admin changes
// their hair or grows a beard.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError } from '../../lib/http.js';
import { authenticate } from '../../lib/auth.js';
import { faceServiceConfigured, embedEnrolmentImages } from '../../lib/faceservice.js';
import { enrolmentGallery } from '../../lib/facematch.js';
import { updateFaceRow } from '../../lib/facedb.js';

const isImage = (v) => typeof v === 'string' && v.startsWith('data:image');
const isVector = (v) => Array.isArray(v) && v.length >= 64;

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  const admin = authenticate(req, res);
  if (!admin) return;

  try {
    const body = await readJsonBody(req);
    const descriptors = (Array.isArray(body.descriptors) ? body.descriptors : [body.descriptor]).filter(isVector);
    const images = (Array.isArray(body.images) ? body.images : [body.image]).filter(isImage);

    if (!descriptors.length) {
      return badRequest(res, 'A valid face descriptor is required.');
    }

    const patch = {
      face_descriptor: descriptors[0], // legacy single-template column
      face_templates: enrolmentGallery(descriptors),
      updated_at: new Date().toISOString(),
    };

    // ArcFace embeddings when the InsightFace service is configured — admin face
    // login prefers them, and falls back to the descriptors when it is not.
    if (faceServiceConfigured() && images.length) {
      const embeddings = await embedEnrolmentImages(images);
      if (embeddings.length) {
        patch.arcface_embedding = embeddings[0];
        patch.arcface_templates = enrolmentGallery(embeddings);
      }
    }

    const supabase = getSupabase();
    const { error } = await updateFaceRow(supabase, 'admin_users', admin.sub, patch);
    if (error) return serverError(res, error.message);
    return ok(res, { enrolled: true, templates: patch.face_templates.length, arcface: !!patch.arcface_templates });
  } catch (err) {
    console.error('enroll-face error:', err.message);
    return serverError(res, 'Could not enrol face');
  }
}
