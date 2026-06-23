// Bulk communications (spec 4.12). Owner/Manager.
//   POST /api/admin/broadcast { filter:{status,tier}, subject, message }
// Sends an email (Brevo) to the filtered member group and logs each send.
// (Member WhatsApp blasts aren't supported by CallMeBot — owner alerts only —
// so member broadcasts are email.)
import { getSupabase } from '../_lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError } from '../_lib/http.js';
import { requireRole } from '../_lib/auth.js';
import { sendEmail, emailConfigured } from '../_lib/notify/channels.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  if (!requireRole(req, res, ['owner', 'manager'])) return;
  if (!emailConfigured()) return badRequest(res, 'Email is not configured (set BREVO_API_KEY).');

  try {
    const { filter = {}, subject, message } = await readJsonBody(req);
    if (!subject || !message) return badRequest(res, 'subject and message are required.');

    const supabase = getSupabase();
    const { data: gp } = await supabase.from('settings').select('value').eq('key', 'gym_profile').maybeSingle();
    const gymName = gp?.value?.name || 'Your Gym';

    // Build the recipient query.
    let q = supabase.from('members').select('id, full_name, email');
    if (filter.status) q = q.eq('status', filter.status);
    if (filter.tier) {
      // tier lives on memberships; fetch matching member_ids first
      const { data: ms } = await supabase.from('memberships').select('member_id').eq('tier', filter.tier).eq('state', 'active');
      const ids = [...new Set((ms || []).map((m) => m.member_id))];
      if (!ids.length) return ok(res, { sent: 0, failed: 0 });
      q = q.in('id', ids);
    }
    const { data: members, error } = await q;
    if (error) return serverError(res, error.message);

    const html = `<div style="font-family:Arial,sans-serif">${message.replace(/\n/g, '<br>')}</div>`;
    let sent = 0;
    let failed = 0;
    for (const m of members || []) {
      if (!m.email) continue;
      const r = await sendEmail({ to: m.email, toName: m.full_name, subject, html, sender: { name: gymName } });
      await supabase.from('notifications_log').insert({
        member_id: m.id,
        recipient: m.email,
        channel: 'email',
        template_key: 'broadcast',
        subject,
        body: message,
        status: r.ok ? 'sent' : 'failed',
        error_message: r.ok ? null : r.error,
        sent_at: r.ok ? new Date().toISOString() : null,
      });
      r.ok ? sent++ : failed++;
    }

    return ok(res, { sent, failed, total: (members || []).length });
  } catch (err) {
    console.error('broadcast error:', err.message);
    return serverError(res, 'Broadcast failed');
  }
}
