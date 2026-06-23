// POST /api/admin/training-session -> log a PT session + workout notes (spec 4.8).
//   { membership_number, workout_notes, completed }
// Trainers log against their own trainer profile; owner/manager may pass trainer_id.
import { getSupabase } from '../_lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError } from '../_lib/http.js';
import { requireRole } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  const admin = requireRole(req, res, ['owner', 'manager', 'trainer']);
  if (!admin) return;

  try {
    const { membership_number, workout_notes, completed, trainer_id } = await readJsonBody(req);
    if (!membership_number) return badRequest(res, 'membership_number is required.');

    const supabase = getSupabase();
    const { data: member } = await supabase
      .from('members')
      .select('id')
      .eq('membership_number', membership_number.trim().toUpperCase())
      .maybeSingle();
    if (!member) return badRequest(res, 'Member not found.');

    const tId = admin.role === 'trainer' ? admin.trainer_id : trainer_id || null;

    const { error } = await supabase.from('training_sessions').insert({
      member_id: member.id,
      trainer_id: tId,
      workout_notes: workout_notes || null,
      completed: !!completed,
      completed_at: completed ? new Date().toISOString() : null,
      scheduled_at: new Date().toISOString(),
    });
    if (error) return serverError(res, error.message);

    return ok(res, { logged: true });
  } catch (err) {
    console.error('training-session error:', err.message);
    return serverError(res, 'Could not log session');
  }
}
