// GET /api/admin/clients -> personal-training sessions / client list (spec 4.8).
// Trainers see only their own sessions; owner/manager see all.
import { getSupabase } from '../../_lib/supabase.js';
import { allowMethods, ok, serverError } from '../../_lib/http.js';
import { requireRole } from '../../_lib/auth.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;
  const admin = requireRole(req, res, ['owner', 'manager', 'trainer']);
  if (!admin) return;

  try {
    const supabase = getSupabase();
    let q = supabase
      .from('training_sessions')
      .select('id, scheduled_at, completed, completed_at, workout_notes, members(full_name, membership_number), trainers(full_name)')
      .order('created_at', { ascending: false })
      .limit(100);

    if (admin.role === 'trainer') {
      if (!admin.trainer_id) return ok(res, { sessions: [], note: 'Your admin account is not linked to a trainer profile.' });
      q = q.eq('trainer_id', admin.trainer_id);
    }

    const { data, error } = await q;
    if (error) return serverError(res, error.message);

    return ok(res, {
      sessions: (data || []).map((s) => ({
        id: s.id,
        member: s.members?.full_name,
        membership_number: s.members?.membership_number,
        trainer: s.trainers?.full_name,
        scheduled_at: s.scheduled_at,
        completed: s.completed,
        workout_notes: s.workout_notes,
      })),
    });
  } catch (err) {
    console.error('clients error:', err.message);
    return serverError(res, 'Could not load clients');
  }
}
