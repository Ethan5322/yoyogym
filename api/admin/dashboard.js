// GET /api/admin/dashboard -> at-a-glance metrics for the admin home (spec 4.2).
// Owner/Manager only.
import { getSupabase } from '../_lib/supabase.js';
import { allowMethods, ok, serverError } from '../_lib/http.js';
import { requireRole } from '../_lib/auth.js';

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
      revenue_today: sumAmount(revToday.data),
      revenue_week: sumAmount(revWeek.data),
      revenue_month: sumAmount(revMonth.data),
      recent_registrations: recent.data || [],
    });
  } catch (err) {
    console.error('dashboard error:', err.message);
    return serverError(res, 'Could not load dashboard');
  }
}
