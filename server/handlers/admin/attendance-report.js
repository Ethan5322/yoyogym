// GET /api/admin/attendance-report  (Phase 99 §B4)
// 30-day attendance rates, at-risk (churn) members, best attendance, peak hours.
// Owner/Manager. (Formal adherence scoring is finalised in Section C.)
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, ok, serverError } from '../../lib/http.js';
import { requireRole } from '../../lib/auth.js';

const WEEKLY = { '1_2': 1.5, '3_4': 3.5, '5_6': 5.5, daily: 7 };
const DAYS = 30;

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;
  if (!requireRole(req, res, ['owner', 'manager'])) return;

  try {
    const supabase = getSupabase();
    const since = new Date(Date.now() - DAYS * 86400000);

    const [{ data: members }, { data: checkins }] = await Promise.all([
      supabase.from('members').select('id, full_name, training_frequency').eq('status', 'active'),
      supabase.from('checkins').select('member_id, checked_in_at').gte('checked_in_at', since.toISOString()),
    ]);

    const visits = {};
    const lastVisit = {};
    const peak = {};
    for (const c of checkins || []) {
      visits[c.member_id] = (visits[c.member_id] || 0) + 1;
      const t = new Date(c.checked_in_at);
      if (!lastVisit[c.member_id] || t > lastVisit[c.member_id]) lastVisit[c.member_id] = t;
      const h = String(t.getHours());
      peak[h] = (peak[h] || 0) + 1;
    }

    const rows = (members || []).map((m) => {
      const v = visits[m.id] || 0;
      const expected = Math.round((WEEKLY[m.training_frequency] || 2) * (DAYS / 7));
      const rate = expected ? Math.min(100, Math.round((v / expected) * 100)) : 0;
      const daysSince = lastVisit[m.id] ? Math.floor((Date.now() - lastVisit[m.id]) / 86400000) : null;
      return { member_id: m.id, name: m.full_name, visits: v, expected, rate, days_since: daysSince };
    });

    const atRisk = rows
      .filter((r) => r.days_since == null || r.days_since >= 10)
      .map((r) => ({ name: r.name, days_since: r.days_since }))
      .slice(0, 20);
    const best = [...rows].sort((a, b) => b.visits - a.visits).filter((r) => r.visits > 0).slice(0, 10);

    return ok(res, {
      period_days: DAYS,
      members: rows.sort((a, b) => b.rate - a.rate),
      at_risk: atRisk,
      best,
      peak_hours: peak,
    });
  } catch (err) {
    console.error('attendance-report error:', err.message);
    return serverError(res, 'Could not load report');
  }
}
