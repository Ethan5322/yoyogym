// GET /api/member/classes -> the week's class schedule with live availability
// (spec 2.4 class booking). Expands recurring classes into the next 7 days,
// includes one-off classes in range, enforces tier eligibility, and reports
// booked/available counts plus whether this member is already booked.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, ok, serverError } from '../../lib/http.js';
import { authenticateMember } from '../../lib/memberauth.js';

const DAYS = 7;
const ymd = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;
  const auth = authenticateMember(req, res);
  if (!auth) return;

  try {
    const supabase = getSupabase();

    const { data: membership } = await supabase
      .from('memberships')
      .select('tier')
      .eq('member_id', auth.sub)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const memberTier = membership?.tier || null;

    const { data: classes, error } = await supabase
      .from('classes')
      .select('*, trainers(full_name)')
      .eq('is_active', true);
    if (error) return serverError(res, error.message);

    // Build the date window.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const window = [];
    for (let i = 0; i < DAYS; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      window.push(d);
    }
    const rangeStart = ymd(window[0]);
    const rangeEnd = ymd(window[window.length - 1]);

    // Expand occurrences.
    const occurrences = [];
    for (const c of classes || []) {
      const tierOk = !c.allowed_tiers?.length || (memberTier && c.allowed_tiers.includes(memberTier));
      for (const d of window) {
        const isMatch =
          c.recurrence === 'recurring'
            ? c.day_of_week === d.getDay()
            : c.class_date && ymd(c.class_date) === ymd(d);
        if (isMatch) {
          occurrences.push({
            class_id: c.id,
            name: c.name,
            trainer: c.trainers?.full_name || null,
            session_date: ymd(d),
            start_time: c.start_time,
            duration_minutes: c.duration_minutes,
            max_capacity: c.max_capacity,
            allowed: tierOk,
          });
        }
      }
    }

    // Fetch all bookings in range to compute counts + this member's bookings.
    const { data: bookings } = await supabase
      .from('class_bookings')
      .select('class_id, session_date, member_id, status')
      .gte('session_date', rangeStart)
      .lte('session_date', rangeEnd)
      .in('status', ['booked', 'waitlisted']);

    const bookedCount = {};
    const mine = new Set();
    for (const b of bookings || []) {
      const key = `${b.class_id}|${b.session_date}`;
      if (b.status === 'booked') bookedCount[key] = (bookedCount[key] || 0) + 1;
      if (b.member_id === auth.sub) mine.add(key);
    }

    const schedule = occurrences
      .map((o) => {
        const key = `${o.class_id}|${o.session_date}`;
        const booked = bookedCount[key] || 0;
        return {
          ...o,
          booked_count: booked,
          available: Math.max(0, o.max_capacity - booked),
          is_full: booked >= o.max_capacity,
          already_booked: mine.has(key),
        };
      })
      .sort((a, b) => (a.session_date + (a.start_time || '')).localeCompare(b.session_date + (b.start_time || '')));

    return ok(res, { schedule });
  } catch (err) {
    console.error('classes error:', err.message);
    return serverError(res, 'Could not load classes');
  }
}
