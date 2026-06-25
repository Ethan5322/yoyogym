// Weekly class schedule email (spec 3.4 — "Every week Monday: send weekly class
// schedule to all active members"). Endpoint + run().
//
// Builds this week's line-up (recurring classes by weekday + one-off classes
// dated within the next 7 days) and emails every ACTIVE member. Mirrors the
// efficient broadcast pattern: gym name + template are resolved once, only the
// greeting differs per member, and each send is recorded in notifications_log.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, ok, serverError } from '../../lib/http.js';
import { authorizeCron } from '../../lib/cron.js';
import { sendEmail, emailConfigured } from '../../lib/notify/channels.js';
import { memberTemplates } from '../../lib/notify/templates.js';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const hhmm = (t) => (t ? String(t).slice(0, 5) : '');

export async function run(supabase) {
  if (!emailConfigured()) return { skipped: 'email_not_configured' };

  // Week window: today (Mon when scheduled) through the next 6 days.
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const startYmd = start.toISOString().slice(0, 10);
  const endYmd = end.toISOString().slice(0, 10);

  const { data: classes, error: cErr } = await supabase
    .from('classes')
    .select('name, recurrence, day_of_week, start_time, class_date, trainers(full_name)')
    .eq('is_active', true);
  if (cErr) throw new Error(cErr.message);

  // Build a sortable list of this week's sessions.
  const sessions = [];
  for (const c of classes || []) {
    const trainer = c.trainers?.full_name ? ` — ${c.trainers.full_name}` : '';
    if (c.recurrence === 'recurring') {
      if (c.day_of_week == null) continue;
      // Map the recurring weekday onto its actual date in this 7-day window.
      const offset = (Number(c.day_of_week) - start.getDay() + 7) % 7;
      const d = new Date(start);
      d.setDate(d.getDate() + offset);
      sessions.push({
        sortKey: `${d.toISOString().slice(0, 10)} ${hhmm(c.start_time)}`,
        day: `${DAYS[Number(c.day_of_week)]} ${hhmm(c.start_time)}`.trim(),
        detail: `${c.name}${trainer}`,
      });
    } else if (c.class_date && c.class_date >= startYmd && c.class_date < endYmd) {
      const d = new Date(c.class_date);
      sessions.push({
        sortKey: `${c.class_date} ${hhmm(c.start_time)}`,
        day: `${DAYS[d.getDay()]} ${hhmm(c.start_time)}`.trim(),
        detail: `${c.name}${trainer}`,
      });
    }
  }
  sessions.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  const items = sessions.map((s) => ({ day: s.day, detail: s.detail }));

  const weekLabel = `${start.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}–${new Date(
    end.getTime() - 86400000
  ).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}`;

  // Gym name (resolved once).
  const { data: gp } = await supabase.from('settings').select('value').eq('key', 'gym_profile').maybeSingle();
  const gymName = gp?.value?.name || 'Your Gym';

  // Active members with an email.
  const { data: members, error: mErr } = await supabase
    .from('members')
    .select('id, full_name, email, membership_number')
    .eq('status', 'active');
  if (mErr) throw new Error(mErr.message);

  let sent = 0;
  let failed = 0;
  for (const m of members || []) {
    if (!m.email) continue;
    const { subject, html } = memberTemplates.weekly_schedule({ gymName, member: m, weekLabel, items });
    const r = await sendEmail({ to: m.email, toName: m.full_name, subject, html, sender: { name: gymName } });
    try {
      await supabase.from('notifications_log').insert({
        member_id: m.id,
        recipient: m.email,
        channel: 'email',
        template_key: 'weekly_schedule',
        subject,
        status: r.ok ? 'sent' : 'failed',
        error_message: r.ok ? null : r.error,
        sent_at: r.ok ? new Date().toISOString() : null,
      });
    } catch {
      /* logging must never throw */
    }
    r.ok ? sent++ : failed++;
  }

  return { sent, failed, classes: items.length };
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;
  if (!authorizeCron(req, res)) return;
  try {
    return ok(res, await run(getSupabase()));
  } catch (err) {
    console.error('weekly-schedule cron error:', err.message);
    return serverError(res, 'Weekly schedule run failed');
  }
}
