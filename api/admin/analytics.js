// Attendance & analytics (spec 4.10). Owner/Manager.
// Returns check-ins per day (30d), tier distribution, medical-aid breakdown,
// new vs lapsed this month, and revenue trend (6 months).
import { getSupabase } from '../_lib/supabase.js';
import { allowMethods, ok, serverError } from '../_lib/http.js';
import { requireRole } from '../_lib/auth.js';

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

    const [{ data: checkins }, { data: memberships }, { data: members }, { data: payments }] =
      await Promise.all([
        supabase.from('checkins').select('checked_in_at').gte('checked_in_at', since30.toISOString()),
        supabase.from('memberships').select('tier, state'),
        supabase.from('members').select('has_medical_aid, medical_aid_provider, status'),
        supabase.from('payments').select('amount, paid_at').eq('status', 'received').gte('paid_at', since6mo.toISOString()),
      ]);

    // check-ins per day
    const perDay = {};
    for (const c of checkins || []) {
      const k = ymd(new Date(c.checked_in_at));
      perDay[k] = (perDay[k] || 0) + 1;
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

    return ok(res, {
      checkins_per_day: perDay,
      tier_distribution: tierDist,
      medical_aid: { with_aid: withAid, total: (members || []).length, by_provider: medAid },
      revenue_trend: revTrend,
      status_counts: statusCounts,
    });
  } catch (err) {
    console.error('analytics error:', err.message);
    return serverError(res, 'Could not load analytics');
  }
}
