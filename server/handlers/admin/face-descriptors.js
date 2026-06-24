// GET /api/admin/face-descriptors -> enrolled face descriptors for members +
// trainers (Phase 99 §A). Fetched once and cached client-side so matching is
// instant. Returns only id/name/descriptor — NO photos or sensitive data.
// Owner/Manager/Reception.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, ok, serverError } from '../../lib/http.js';
import { requireRole } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;
  if (!requireRole(req, res, ['owner', 'manager', 'reception'])) return;

  try {
    const supabase = getSupabase();
    const [{ data: members, error: mErr }, { data: trainers, error: tErr }] = await Promise.all([
      supabase
        .from('members')
        .select('id, full_name, membership_number, face_descriptor')
        .not('face_descriptor', 'is', null),
      supabase
        .from('trainers')
        .select('id, full_name, face_descriptor')
        .not('face_descriptor', 'is', null),
    ]);
    if (mErr) return serverError(res, mErr.message);
    if (tErr) return serverError(res, tErr.message);

    const people = [
      ...(members || []).map((m) => ({
        type: 'member',
        id: m.id,
        name: m.full_name,
        membership_number: m.membership_number,
        descriptor: m.face_descriptor,
      })),
      ...(trainers || []).map((t) => ({
        type: 'trainer',
        id: t.id,
        name: t.full_name,
        descriptor: t.face_descriptor,
      })),
    ];

    return ok(res, { people, count: people.length });
  } catch (err) {
    console.error('face-descriptors error:', err.message);
    return serverError(res, 'Could not load face descriptors');
  }
}
