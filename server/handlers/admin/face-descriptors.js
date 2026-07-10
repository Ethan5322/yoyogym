// GET /api/admin/face-descriptors -> enrolled face template galleries for
// members + trainers (Phase 99 §A). Fetched once and cached client-side so the
// turnstile matches instantly. Returns id/name plus a `templates` array of
// 128-D face-api descriptors — NO photos or other sensitive data.
// Owner/Manager/Reception.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, ok, serverError } from '../../lib/http.js';
import { requireRole } from '../../lib/auth.js';
import { selectFaceRows } from '../../lib/facedb.js';
import { templatesOf } from '../../lib/facematch.js';

const OPTS = { arrayKey: 'face_templates', legacyKey: 'face_descriptor' };

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;
  if (!requireRole(req, res, ['owner', 'manager', 'reception'])) return;

  try {
    const supabase = getSupabase();
    const [mRes, tRes] = await Promise.all([
      selectFaceRows(supabase, 'members', {
        columns: 'id, full_name, membership_number, face_descriptor, face_templates',
        legacyColumns: 'id, full_name, membership_number, face_descriptor',
        apply: (q) => q.not('face_descriptor', 'is', null),
      }),
      selectFaceRows(supabase, 'trainers', {
        columns: 'id, full_name, face_descriptor, face_templates',
        legacyColumns: 'id, full_name, face_descriptor',
        apply: (q) => q.not('face_descriptor', 'is', null),
      }),
    ]);
    if (mRes.error) return serverError(res, mRes.error.message);
    if (tRes.error) return serverError(res, tRes.error.message);

    const people = [
      ...(mRes.data || []).map((m) => ({
        type: 'member',
        id: m.id,
        name: m.full_name,
        membership_number: m.membership_number,
        templates: templatesOf(m, OPTS),
      })),
      ...(tRes.data || []).map((t) => ({
        type: 'trainer',
        id: t.id,
        name: t.full_name,
        templates: templatesOf(t, OPTS),
      })),
    ].filter((p) => p.templates.length);

    return ok(res, { people, count: people.length });
  } catch (err) {
    console.error('face-descriptors error:', err.message);
    return serverError(res, 'Could not load face descriptors');
  }
}
