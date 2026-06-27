// GET /api/member/history -> recent attendance (check-ins) and class bookings
// for the member (spec 2.4 D).
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, ok, serverError } from '../../lib/http.js';
import { authenticateMember } from '../../lib/memberauth.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;
  const auth = authenticateMember(req, res);
  if (!auth) return;

  try {
    const supabase = getSupabase();
    const [{ data: checkins }, { data: bookings }, sessionsRes] = await Promise.all([
      supabase
        .from('checkins')
        .select('checked_in_at, checked_out_at, method')
        .eq('member_id', auth.sub)
        .order('checked_in_at', { ascending: false })
        .limit(20),
      supabase
        .from('class_bookings')
        .select('session_date, status, classes(name)')
        .eq('member_id', auth.sub)
        .order('session_date', { ascending: false })
        .limit(20),
      supabase
        .from('training_sessions')
        .select('scheduled_at, completed_at, workout_notes, trainers(full_name)')
        .eq('member_id', auth.sub)
        .not('workout_notes', 'is', null)
        .order('scheduled_at', { ascending: false })
        .limit(20)
        .then((r) => r, () => ({ data: [] })),
    ]);

    return ok(res, {
      checkins: checkins || [],
      bookings: (bookings || []).map((b) => ({
        session_date: b.session_date,
        status: b.status,
        class_name: b.classes?.name || 'Class',
      })),
      sessions: (sessionsRes?.data || []).map((s) => ({
        at: s.completed_at || s.scheduled_at,
        notes: s.workout_notes,
        trainer: s.trainers?.full_name || 'Trainer',
      })),
    });
  } catch (err) {
    console.error('history error:', err.message);
    return serverError(res, 'Could not load history');
  }
}
