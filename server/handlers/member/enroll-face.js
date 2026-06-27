// POST /api/member/enroll-face  { descriptor, image? }
// Lets a signed-in member (re)enrol their own face for face login / access.
// Stores the averaged 128-D descriptor (and optionally refreshes their photo).
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError } from '../../lib/http.js';
import { authenticateMember } from '../../lib/memberauth.js';
import { faceServiceConfigured, embedFace } from '../../lib/faceservice.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  const auth = authenticateMember(req, res);
  if (!auth) return;

  try {
    const { descriptor, image } = await readJsonBody(req);
    const hasDescriptor = Array.isArray(descriptor) && descriptor.length >= 64;
    const hasImage = typeof image === 'string' && image.startsWith('data:image');
    if (!hasDescriptor && !hasImage) {
      return badRequest(res, 'A valid face scan is required.');
    }

    const patch = { biometric_enrolled: true, updated_at: new Date().toISOString() };
    if (hasDescriptor) patch.face_descriptor = descriptor; // legacy face-api fallback
    if (hasImage) patch.photo_url = image;

    // High-accuracy ArcFace embedding (preferred) when the service is configured.
    if (faceServiceConfigured() && hasImage) {
      const emb = await embedFace(image);
      if (!emb && !hasDescriptor) return badRequest(res, 'No face detected — try again with better lighting.');
      if (emb) patch.arcface_embedding = emb;
    }

    const supabase = getSupabase();
    const { error } = await supabase.from('members').update(patch).eq('id', auth.sub);
    if (error) return serverError(res, error.message);
    return ok(res, { enrolled: true, arcface: !!patch.arcface_embedding, message: 'Your face scan has been updated.' });
  } catch (err) {
    console.error('member enroll-face error:', err.message);
    return serverError(res, 'Could not save your face scan');
  }
}
