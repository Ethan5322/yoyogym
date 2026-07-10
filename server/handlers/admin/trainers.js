// Trainer management CRUD (spec 4.8). Owner/Manager.
//   GET / POST / PATCH?id / DELETE?id
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError } from '../../lib/http.js';
import { requireRole } from '../../lib/auth.js';
import { generateTrainerNumber, generateTrainerCode } from '../../lib/identifiers.js';
import { enrolmentGallery } from '../../lib/facematch.js';
import { insertFaceRow, updateFaceRow } from '../../lib/facedb.js';

const FIELDS = ['full_name', 'phone', 'email', 'specialization', 'certifications', 'bio', 'is_active', 'photo_url', 'face_descriptor'];
const pick = (b) => Object.fromEntries(FIELDS.filter((f) => b[f] !== undefined).map((f) => [f, b[f]]));

// Turn a multi-pose capture into the stored face gallery: first pose in the
// legacy column (un-migrated tenants still match), full set in face_templates.
function withFaceGallery(raw, picked) {
  const descriptors = (Array.isArray(raw.face_descriptors) ? raw.face_descriptors : []).filter(
    (d) => Array.isArray(d) && d.length >= 64
  );
  if (descriptors.length) {
    picked.face_descriptor = descriptors[0];
    picked.face_templates = enrolmentGallery(descriptors);
  }
  return picked;
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST', 'PATCH', 'DELETE'])) return;
  if (!requireRole(req, res, ['owner', 'manager'])) return;

  const supabase = getSupabase();
  const id = new URL(req.url, 'http://localhost').searchParams.get('id');

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('trainers').select('*').order('full_name');
      if (error) return serverError(res, error.message);
      return ok(res, { trainers: data || [] });
    }
    if (req.method === 'POST') {
      const raw = await readJsonBody(req);
      const body = withFaceGallery(raw, pick(raw));
      if (!body.full_name) return badRequest(res, 'Trainer name is required.');

      // Issue a trainer number + verification code (needs the migrated columns).
      let trainer_number = null;
      let verification_code = null;
      try {
        trainer_number = await generateTrainerNumber(supabase);
        verification_code = await generateTrainerCode(supabase);
      } catch {
        /* columns not migrated yet — trainer is still created below */
      }

      // insertFaceRow strips the gallery column on an un-migrated tenant; the
      // outer fallback drops the credential columns if those aren't present.
      let { data, error } = await insertFaceRow(supabase, 'trainers', { ...body, trainer_number, verification_code }, 'id');
      if (error) {
        trainer_number = null;
        verification_code = null;
        ({ data, error } = await insertFaceRow(supabase, 'trainers', body, 'id'));
      }
      if (error) return serverError(res, error.message);
      return ok(res, { id: data.id, trainer_number, verification_code });
    }
    if (req.method === 'PATCH') {
      if (!id) return badRequest(res, 'id is required.');
      const raw = await readJsonBody(req);
      const body = withFaceGallery(raw, pick(raw));
      body.updated_at = new Date().toISOString();
      const { error } = await updateFaceRow(supabase, 'trainers', id, body);
      if (error) return serverError(res, error.message);
      return ok(res, { updated: true });
    }
    if (req.method === 'DELETE') {
      if (!id) return badRequest(res, 'id is required.');
      const { error } = await supabase.from('trainers').delete().eq('id', id);
      if (error) return serverError(res, error.message);
      return ok(res, { deleted: true });
    }
  } catch (err) {
    console.error('trainers admin error:', err.message);
    return serverError(res, 'Trainer operation failed');
  }
}
