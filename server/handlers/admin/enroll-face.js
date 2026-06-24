// POST /api/admin/enroll-face  { descriptor }  (Type C admin face login enrolment)
// Stores the signed-in admin's face descriptor so they can later log in by face.
// Any authenticated admin may enrol their own face.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError } from '../../lib/http.js';
import { authenticate } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  const admin = authenticate(req, res);
  if (!admin) return;

  try {
    const { descriptor } = await readJsonBody(req);
    if (!Array.isArray(descriptor) || descriptor.length < 64) {
      return badRequest(res, 'A valid face descriptor is required.');
    }
    const supabase = getSupabase();
    const { error } = await supabase
      .from('admin_users')
      .update({ face_descriptor: descriptor, updated_at: new Date().toISOString() })
      .eq('id', admin.sub);
    if (error) return serverError(res, error.message);
    return ok(res, { enrolled: true });
  } catch (err) {
    console.error('enroll-face error:', err.message);
    return serverError(res, 'Could not enrol face');
  }
}
