// GET /api/member/history -> recent attendance (check-ins) and class bookings
// for the member (spec 2.4 D).
import { getSupabase } from '../_lib/supabase.js';
import { allowMethods, ok, serverError } from '../_lib/http.js';
import { authenticateMember } from '../_lib/memberauth.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;
  const auth = authenticateMember(req, res);
  if (!auth) return;

  try {
    const supabase = getSupabase();
    const [{ data: checkins }, { data: bookings }] = await Promise.all([
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
    ]);

    return ok(res, {
      checkins: checkins || [],
      bookings: (bookings || []).map((b) => ({
        session_date: b.session_date,
        status: b.status,
        class_name: b.classes?.name || 'Class',
      })),
    });
  } catch (err) {
    console.error('history error:', err.message);
    return serverError(res, 'Could not load history');
  }
}
