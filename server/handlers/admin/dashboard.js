// GET /api/admin/dashboard -> at-a-glance metrics for the admin home (spec 4.2).
// Owner/Manager only.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, ok, serverError } from '../../lib/http.js';
import { requireRole } from '../../lib/auth.js';

const startOf = (period) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (period === 'week') {
    const dow = (d.getDay() + 6) % 7; // Monday start
    d.setDate(d.getDate() - dow);
  } else if (period === 'month') {
    d.setDate(1);
  }
  return d.toISOString();
};

const count = async (q) => (await q).count || 0;
const sumAmount = (rows) => (rows || []).reduce((s, r) => s + Number(r.amount || 0), 0);

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;
  if (!requireRole(req, res, ['owner', 'manager'])) return;

  try {
    const supabase = getSupabase();
    const dayStart = startOf('day');
    const weekStart = startOf('week');
    const monthStart = startOf('month');
    const in7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const todayDate = new Date().toISOString().slice(0, 10);

    const c = (extra) => supabase.from('members').select('id', { count: 'exact', head: true });

    const [
      checkinsToday,
      newToday,
      newWeek,
      newMonth,
      activeMembers,
      lapsedMembers,
      parqFlags,
      expiringSoon,
      revToday,
      revWeek,
      revMonth,
      recent,
    ] = await Promise.all([
      count(supabase.from('checkins').select('id', { count: 'exact', head: true }).gte('checked_in_at', dayStart)),
      count(c().gte('created_at', dayStart)),
      count(c().gte('created_at', weekStart)),
      count(c().gte('created_at', monthStart)),
      count(c().eq('status', 'active')),
      count(c().eq('status', 'lapsed')),
      count(c().eq('parq_flag', true).neq('status', 'lapsed')),
      count(
        supabase
          .from('memberships')
          .select('id', { count: 'exact', head: true })
          .eq('state', 'active')
          .gte('end_date', todayDate)
          .lte('end_date', in7)
      ),
      supabase.from('payments').select('amount').eq('status', 'received').gte('paid_at', dayStart),
      supabase.from('payments').select('amount').eq('status', 'received').gte('paid_at', weekStart),
      supabase.from('payments').select('amount').eq('status', 'received').gte('paid_at', monthStart),
      supabase
        .from('members')
        .select('full_name, membership_number, created_at, status')
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    const failedPayments = await count(
      supabase.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'failed')
    );

    // Classes today at 90%+ capacity (alert banner, spec 4.2)
    const today = new Date();
    const todayYmd = today.toISOString().slice(0, 10);
    const dow = today.getDay();
    const [{ data: classes }, { data: recentPays }, { data: recentChecks }] = await Promise.all([
      supabase.from('classes').select('id, max_capacity, recurrence, day_of_week, class_date').eq('is_active', true),
      supabase.from('payments').select('amount, status, created_at, members(full_name)').order('created_at', { ascending: false }).limit(6),
      supabase.from('checkins').select('checked_in_at, members(full_name)').order('checked_in_at', { ascending: false }).limit(6),
    ]);
    const todays = (classes || []).filter((cl) => (cl.recurrence === 'recurring' ? cl.day_of_week === dow : cl.class_date === todayYmd));
    let classesFull = 0;
    if (todays.length) {
      const { data: bk } = await supabase
        .from('class_bookings')
        .select('class_id')
        .eq('session_date', todayYmd)
        .eq('status', 'booked');
      const counts = {};
      for (const b of bk || []) counts[b.class_id] = (counts[b.class_id] || 0) + 1;
      classesFull = todays.filter((cl) => (counts[cl.id] || 0) >= cl.max_capacity * 0.9).length;
    }

    // Recent activity feed (last ~10 events, spec 4.2)
    const feed = [
      ...(recent.data || []).map((m) => ({ type: 'registration', text: `${m.full_name} registered`, at: m.created_at })),
      ...(recentPays || []).map((p) => ({ type: 'payment', text: `${p.members?.full_name || 'Member'} — payment ${p.status}`, at: p.created_at })),
      ...(recentChecks || []).map((c2) => ({ type: 'checkin', text: `${c2.members?.full_name || 'Member'} checked in`, at: c2.checked_in_at })),
    ]
      .filter((e) => e.at)
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, 10);

    return ok(res, {
      checkins_today: checkinsToday,
      new_today: newToday,
      new_week: newWeek,
      new_month: newMonth,
      active_members: activeMembers,
      lapsed_members: lapsedMembers,
      parq_flags: parqFlags,
      expiring_soon: expiringSoon,
      failed_payments: failedPayments,
      classes_full: classesFull,
      revenue_today: sumAmount(revToday.data),
      revenue_week: sumAmount(revWeek.data),
      revenue_month: sumAmount(revMonth.data),
      recent_registrations: recent.data || [],
      activity: feed,
    });
  } catch (err) {
    console.error('dashboard error:', err.message);
    return serverError(res, 'Could not load dashboard');
  }
}
