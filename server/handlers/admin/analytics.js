// Attendance & analytics (spec 4.10). Owner/Manager.
// Returns check-ins per day (30d), tier distribution, medical-aid breakdown,
// new vs lapsed this month, and revenue trend (6 months).
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, ok, serverError } from '../../lib/http.js';
import { requireRole } from '../../lib/auth.js';

const ymd = (d) => d.toISOString().slice(0, 10);
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;
  if (!requireRole(req, res, ['owner', 'manager'])) return;

  try {
    const supabase = getSupabase();
    const since30 = new Date(Date.now() - 30 * 86400000);
    const since6mo = new Date();
    since6mo.setMonth(since6mo.getMonth() - 5);
    since6mo.setDate(1);
    since6mo.setHours(0, 0, 0, 0);

    const [{ data: checkins }, { data: memberships }, { data: members }, { data: payments }, { data: bookings }] =
      await Promise.all([
        supabase.from('checkins').select('checked_in_at').gte('checked_in_at', since30.toISOString()),
        supabase.from('memberships').select('tier, state'),
        supabase.from('members').select('has_medical_aid, medical_aid_provider, status, created_at'),
        supabase.from('payments').select('amount, paid_at').eq('status', 'received').gte('paid_at', since6mo.toISOString()),
        supabase.from('class_bookings').select('status, classes(name)').in('status', ['booked', 'attended']).gte('booked_at', since30.toISOString()),
      ]);

    // check-ins per day + busiest hours (0–23)
    const perDay = {};
    const perHour = {};
    for (let h = 0; h < 24; h++) perHour[String(h).padStart(2, '0')] = 0;
    for (const c of checkins || []) {
      const d = new Date(c.checked_in_at);
      perDay[ymd(d)] = (perDay[ymd(d)] || 0) + 1;
      const hk = String(d.getHours()).padStart(2, '0');
      perHour[hk] = (perHour[hk] || 0) + 1;
    }

    // most popular classes (by bookings, last 30 days)
    const classCounts = {};
    for (const b of bookings || []) {
      const name = b.classes?.name;
      if (name) classCounts[name] = (classCounts[name] || 0) + 1;
    }
    const popularClasses = Object.fromEntries(
      Object.entries(classCounts).sort((a, b) => b[1] - a[1]).slice(0, 8)
    );

    // new vs lapsed (last 30 days) + churn snapshot
    let newMembers30 = 0;
    for (const m of members || []) {
      if (m.created_at && new Date(m.created_at) >= since30) newMembers30++;
    }

    // tier distribution (active memberships)
    const tierDist = {};
    for (const m of memberships || []) {
      if (m.state === 'active' && m.tier) tierDist[m.tier] = (tierDist[m.tier] || 0) + 1;
    }

    // medical aid breakdown
    const medAid = {};
    let withAid = 0;
    for (const m of members || []) {
      if (m.has_medical_aid) {
        withAid++;
        const p = m.medical_aid_provider || 'other';
        medAid[p] = (medAid[p] || 0) + 1;
      }
    }

    // revenue trend by month
    const revTrend = {};
    for (const p of payments || []) {
      const k = monthKey(new Date(p.paid_at));
      revTrend[k] = (revTrend[k] || 0) + Number(p.amount || 0);
    }

    // status counts (for retention/churn snapshot)
    const statusCounts = {};
    for (const m of members || []) statusCounts[m.status] = (statusCounts[m.status] || 0) + 1;

    const active = statusCounts.active || 0;
    const lapsed = statusCounts.lapsed || 0;
    const churnRate = active + lapsed ? Math.round((lapsed / (active + lapsed)) * 100) : 0;

    return ok(res, {
      checkins_per_day: perDay,
      busiest_hours: perHour,
      popular_classes: popularClasses,
      tier_distribution: tierDist,
      medical_aid: { with_aid: withAid, total: (members || []).length, by_provider: medAid },
      revenue_trend: revTrend,
      status_counts: statusCounts,
      retention: { active, lapsed, churn_rate: churnRate, new_30d: newMembers30 },
    });
  } catch (err) {
    console.error('analytics error:', err.message);
    return serverError(res, 'Could not load analytics');
  }
}
