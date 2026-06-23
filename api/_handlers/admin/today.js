// GET /api/admin/today -> today's check-ins, who's currently inside, and
// today's class schedule with booking counts (spec 4.6). Owner/Manager/Reception.
import { getSupabase } from '../../_lib/supabase.js';
import { allowMethods, ok, serverError } from '../../_lib/http.js';
import { requireRole } from '../../_lib/auth.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;
  if (!requireRole(req, res, ['owner', 'manager', 'reception'])) return;

  try {
    const supabase = getSupabase();
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const today = new Date();
    const todayYmd = today.toISOString().slice(0, 10);
    const dow = today.getDay();

    const [{ data: checkins }, { data: classes }] = await Promise.all([
      supabase
        .from('checkins')
        .select('checked_in_at, checked_out_at, members(full_name, membership_number)')
        .gte('checked_in_at', dayStart.toISOString())
        .order('checked_in_at', { ascending: false }),
      supabase.from('classes').select('*, trainers(full_name)').eq('is_active', true),
    ]);

    const todaysClasses = (classes || []).filter((c) =>
      c.recurrence === 'recurring' ? c.day_of_week === dow : c.class_date === todayYmd
    );

    // booking counts for today's classes
    const ids = todaysClasses.map((c) => c.id);
    let counts = {};
    if (ids.length) {
      const { data: bookings } = await supabase
        .from('class_bookings')
        .select('class_id, status')
        .in('class_id', ids)
        .eq('session_date', todayYmd)
        .eq('status', 'booked');
      for (const b of bookings || []) counts[b.class_id] = (counts[b.class_id] || 0) + 1;
    }

    const list = (checkins || []).map((c) => ({
      name: c.members?.full_name,
      number: c.members?.membership_number,
      at: c.checked_in_at,
      inside: !c.checked_out_at,
    }));

    return ok(res, {
      total_checkins: list.length,
      currently_inside: list.filter((c) => c.inside).length,
      checkins: list,
      classes: todaysClasses
        .map((c) => ({
          id: c.id,
          name: c.name,
          trainer: c.trainers?.full_name || null,
          start_time: c.start_time,
          max_capacity: c.max_capacity,
          booked: counts[c.id] || 0,
        }))
        .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || '')),
    });
  } catch (err) {
    console.error('today error:', err.message);
    return serverError(res, 'Could not load today');
  }
}
