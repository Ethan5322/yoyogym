// GET /api/admin/attendance-live  (Phase 99 §B1/B2)
// Live gym-floor status + today's attendance board with per-member status.
// Owner/Manager/Reception. Polled by the dashboard every ~30s.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, ok, serverError } from '../../lib/http.js';
import { requireRole } from '../../lib/auth.js';
import { loadCompliance, SLOTS } from '../../lib/compliance.js';

const HIGH_FREQ = new Set(['daily', '5_6']); // likely to be expected every day

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;
  if (!requireRole(req, res, ['owner', 'manager', 'reception'])) return;

  try {
    const supabase = getSupabase();
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);

    const [{ data: members }, { data: checkins }, { data: memberships }, config] =
      await Promise.all([
        supabase.from('members').select('id, full_name, photo_url, preferred_time, training_frequency, status').eq('status', 'active'),
        supabase.from('checkins').select('member_id, checked_in_at, checked_out_at').gte('checked_in_at', dayStart.toISOString()),
        supabase.from('memberships').select('member_id, tier, state').eq('state', 'active'),
        loadCompliance(supabase),
      ]);

    const capacity = config.capacity;
    const SESSION_MINUTES = config.session_minutes;
    const tierOf = {};
    for (const m of memberships || []) tierOf[m.member_id] = m.tier;

    // latest check-in per member today (and open session)
    const byMember = {};
    for (const c of checkins || []) {
      const cur = byMember[c.member_id];
      if (!cur || new Date(c.checked_in_at) > new Date(cur.checked_in_at)) byMember[c.member_id] = c;
    }

    const now = Date.now();
    const hour = new Date().getHours();
    let insideCount = 0;
    let overtimeCount = 0;
    let expectedNotArrived = 0;

    const board = (members || []).map((m) => {
      const c = byMember[m.id];
      const slot = SLOTS[m.preferred_time];
      let status = 'gray';
      let minutes = null;
      let inside = false;

      if (c) {
        inside = !c.checked_out_at;
        const end = inside ? now : new Date(c.checked_out_at).getTime();
        minutes = Math.floor((end - new Date(c.checked_in_at).getTime()) / 60000);
        const overtime = inside && minutes > SESSION_MINUTES;
        const inSlot = !slot || (hour >= slot.start && hour < slot.end);
        if (inside) insideCount++;
        if (overtime) {
          overtimeCount++;
          status = 'overtime';
        } else if (inSlot) {
          status = 'on_schedule';
        } else {
          status = 'extra';
        }
      } else {
        // not arrived: red if high-frequency (expected today), else gray
        if (HIGH_FREQ.has(m.training_frequency)) {
          status = 'not_arrived';
          expectedNotArrived++;
        } else {
          status = 'gray';
        }
      }

      return {
        member_id: m.id,
        name: m.full_name,
        photo_url: m.photo_url,
        tier: tierOf[m.id] || null,
        slot_label: slot?.label || 'Flexible',
        checked_in_at: c?.checked_in_at || null,
        checked_out_at: c?.checked_out_at || null,
        minutes,
        inside,
        status,
      };
    });

    // sort: inside first, then not-arrived, then others; by check-in time
    const order = { overtime: 0, on_schedule: 1, extra: 2, not_arrived: 3, gray: 4 };
    board.sort((a, b) => (order[a.status] - order[b.status]) || (b.checked_in_at || '').localeCompare(a.checked_in_at || ''));

    return ok(res, {
      capacity,
      inside_count: insideCount,
      checked_in_today: Object.keys(byMember).length,
      expected_not_arrived: expectedNotArrived,
      overtime_count: overtimeCount,
      board,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('attendance-live error:', err.message);
    return serverError(res, 'Could not load attendance');
  }
}
