// Accounts-receivable: outstanding-balance aging report + payment-reminder
// (dunning) workflow (corporate finance loop). Owner/Manager.
//   GET  /api/admin/finance            -> aging buckets + per-member outstanding
//   POST /api/admin/finance { member_id }  -> email a balance reminder, log it
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError } from '../../lib/http.js';
import { requireRole } from '../../lib/auth.js';
import { recordAudit } from '../../lib/audit.js';
import { sendEmail, emailConfigured } from '../../lib/notify/channels.js';

const zar = (n) => 'R' + Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 });
const daysSince = (d) => Math.floor((Date.now() - new Date(d).getTime()) / 86400000);

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;
  const admin = requireRole(req, res, ['owner', 'manager']);
  if (!admin) return;

  const supabase = getSupabase();

  try {
    if (req.method === 'POST') {
      const { member_id } = await readJsonBody(req);
      if (!member_id) return badRequest(res, 'member_id is required.');
      if (!emailConfigured()) return badRequest(res, 'Email is not configured (set BREVO_API_KEY).');

      const { data: member } = await supabase
        .from('members')
        .select('id, full_name, email')
        .eq('id', member_id)
        .maybeSingle();
      if (!member) return badRequest(res, 'Member not found.');
      if (!member.email) return badRequest(res, 'This member has no email on file.');

      const { data: due } = await supabase
        .from('payments')
        .select('amount')
        .eq('member_id', member_id)
        .in('status', ['pending', 'failed']);
      const total = (due || []).reduce((s, p) => s + Number(p.amount || 0), 0);
      if (total <= 0) return badRequest(res, 'This member has no outstanding balance.');

      const { data: gp } = await supabase.from('settings').select('value').eq('key', 'gym_profile').maybeSingle();
      const gymName = gp?.value?.name || 'Your Gym';
      const subject = `Payment reminder — ${zar(total)} outstanding`;
      const html = `<div style="font-family:Arial,sans-serif;line-height:1.5">
        <p>Hi ${member.full_name},</p>
        <p>This is a friendly reminder that your account at <strong>${gymName}</strong> has an outstanding balance of <strong>${zar(total)}</strong>.</p>
        <p>You can settle it from your member portal, or at reception on your next visit.</p>
        <p>Thank you,<br>${gymName}</p>
      </div>`;

      const r = await sendEmail({ to: member.email, toName: member.full_name, subject, html, sender: { name: gymName } });
      await supabase.from('notifications_log').insert({
        member_id: member.id,
        recipient: member.email,
        channel: 'email',
        template_key: 'payment_reminder',
        subject,
        body: `Outstanding balance reminder: ${zar(total)}`,
        status: r.ok ? 'sent' : 'failed',
        error_message: r.ok ? null : r.error,
        sent_at: r.ok ? new Date().toISOString() : null,
      });
      if (!r.ok) return serverError(res, 'Could not send the reminder email.');
      await recordAudit(supabase, admin, { action: 'finance.remind', entity: 'member', entity_id: member_id, detail: zar(total) });
      return ok(res, { sent: true, amount: total });
    }

    // GET — aging report over all unsettled (pending/failed) payments.
    const { data, error } = await supabase
      .from('payments')
      .select('amount, created_at, member_id, members(full_name, membership_number, email)')
      .in('status', ['pending', 'failed'])
      .order('created_at', { ascending: true });
    if (error) return serverError(res, error.message);

    const buckets = { current: 0, d30: 0, d60: 0, d90: 0 }; // 0-30, 31-60, 61-90, 90+
    const byMember = new Map();
    let total = 0;

    for (const p of data || []) {
      const amt = Number(p.amount || 0);
      const age = daysSince(p.created_at);
      total += amt;
      if (age <= 30) buckets.current += amt;
      else if (age <= 60) buckets.d30 += amt;
      else if (age <= 90) buckets.d60 += amt;
      else buckets.d90 += amt;

      const key = p.member_id;
      const cur = byMember.get(key) || {
        member_id: key,
        name: p.members?.full_name || 'Unknown',
        number: p.members?.membership_number || '',
        has_email: !!p.members?.email,
        total: 0,
        count: 0,
        oldest_days: 0,
      };
      cur.total += amt;
      cur.count += 1;
      cur.oldest_days = Math.max(cur.oldest_days, age);
      byMember.set(key, cur);
    }

    const members = [...byMember.values()].sort((a, b) => b.total - a.total);
    return ok(res, { total, buckets, members });
  } catch (err) {
    console.error('finance error:', err.message);
    return serverError(res, 'Finance operation failed');
  }
}
