// CRON / on-demand — Attendance alerts to the OWNER (Phase 99 §B3).
// Sends WhatsApp/Telegram/email owner alerts for overtime sessions and high
// gym capacity. Designed to be triggered frequently (e.g. every 15 min) by an
// external scheduler hitting /api/cron/attendance-alerts with the CRON_SECRET.
//
// NOTE: member-facing WhatsApp alerts ("session ends in 15 min") are not
// included — CallMeBot cannot message arbitrary members (it only reaches the
// owner's activated number). Those need a WhatsApp Business API (paid).
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, ok, serverError } from '../../lib/http.js';
import { authorizeCron } from '../../lib/cron.js';
import { notifyOwner } from '../../lib/notify/index.js';
import { ownerTemplates } from '../../lib/notify/templates.js';
import { loadCompliance } from '../../lib/compliance.js';

const OVERTIME_ALERT = 30; // alert once member is 30 min over

export async function run(supabase) {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  const [{ data: open }, config] = await Promise.all([
    supabase
      .from('checkins')
      .select('checked_in_at, members(full_name)')
      .is('checked_out_at', null)
      .gte('checked_in_at', dayStart.toISOString()),
    loadCompliance(supabase),
  ]);

  const SESSION_MINUTES = config.session_minutes;
  const inside = (open || []).length;
  const capacity = config.capacity;
  const pct = Math.round((inside / capacity) * 100);

  let alerts = 0;

  // capacity thresholds
  if (pct >= 95) {
    await notifyOwner(supabase, 'capacity_urgent', ownerTemplates.capacity_urgent({ inside, capacity, pct }));
    alerts++;
  } else if (pct >= 80) {
    await notifyOwner(supabase, 'capacity_high', ownerTemplates.capacity_high({ inside, capacity, pct }));
    alerts++;
  }

  // overtime — alert when 30–45 min over (window avoids repeat spam on frequent runs)
  const now = Date.now();
  for (const c of open || []) {
    const mins = Math.floor((now - new Date(c.checked_in_at).getTime()) / 60000);
    const over = mins - SESSION_MINUTES;
    if (over >= OVERTIME_ALERT && over < OVERTIME_ALERT + 15) {
      await notifyOwner(supabase, 'overtime', ownerTemplates.overtime({ member: c.members?.full_name || 'A member', minutesOver: over }));
      alerts++;
    }
  }

  return { inside, capacity, pct, alerts };
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;
  if (!authorizeCron(req, res)) return;
  try {
    return ok(res, await run(getSupabase()));
  } catch (err) {
    console.error('attendance-alerts cron error:', err.message);
    return serverError(res, 'Attendance alerts failed');
  }
}
