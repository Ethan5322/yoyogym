// Class bookings management (spec 4.7). Owner/Manager.
//   GET  /api/admin/class-bookings?class_id=...        upcoming bookings grouped by date
//   POST /api/admin/class-bookings  { class_id, session_date, op, subject?, message? }
//        op = "cancel"  -> cancel that occurrence's bookings + email members
//           | "notify"  -> email all booked members a custom message
import { getSupabase } from '../_lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError } from '../_lib/http.js';
import { requireRole } from '../_lib/auth.js';
import { sendEmail, emailConfigured } from '../_lib/notify/channels.js';

async function emailBooked(supabase, rows, subject, message) {
  if (!emailConfigured()) return { sent: 0 };
  const { data: gp } = await supabase.from('settings').select('value').eq('key', 'gym_profile').maybeSingle();
  const gymName = gp?.value?.name || 'Your Gym';
  let sent = 0;
  for (const r of rows) {
    const member = r.members;
    if (!member?.email) continue;
    const res = await sendEmail({
      to: member.email,
      toName: member.full_name,
      subject,
      html: `<div style="font-family:Arial,sans-serif">${message.replace(/\n/g, '<br>')}</div>`,
      sender: { name: gymName },
    });
    await supabase.from('notifications_log').insert({
      member_id: member.id,
      recipient: member.email,
      channel: 'email',
      template_key: 'class_notice',
      subject,
      body: message,
      status: res.ok ? 'sent' : 'failed',
      error_message: res.ok ? null : res.error,
      sent_at: res.ok ? new Date().toISOString() : null,
    });
    if (res.ok) sent++;
  }
  return { sent };
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;
  if (!requireRole(req, res, ['owner', 'manager'])) return;

  const supabase = getSupabase();

  try {
    if (req.method === 'GET') {
      const class_id = new URL(req.url, 'http://localhost').searchParams.get('class_id');
      if (!class_id) return badRequest(res, 'class_id is required.');
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from('class_bookings')
        .select('id, session_date, status, members(id, full_name, membership_number, email)')
        .eq('class_id', class_id)
        .gte('session_date', today)
        .order('session_date', { ascending: true });
      if (error) return serverError(res, error.message);
      return ok(res, {
        bookings: (data || []).map((b) => ({
          id: b.id,
          session_date: b.session_date,
          status: b.status,
          member_name: b.members?.full_name,
          membership_number: b.members?.membership_number,
        })),
      });
    }

    // POST
    const { class_id, session_date, op, subject, message } = await readJsonBody(req);
    if (!class_id || !session_date) return badRequest(res, 'class_id and session_date are required.');

    const { data: klass } = await supabase.from('classes').select('name').eq('id', class_id).maybeSingle();
    const className = klass?.name || 'your class';

    const { data: rows, error } = await supabase
      .from('class_bookings')
      .select('id, members(id, full_name, email)')
      .eq('class_id', class_id)
      .eq('session_date', session_date)
      .in('status', ['booked', 'waitlisted']);
    if (error) return serverError(res, error.message);

    if (op === 'cancel') {
      await supabase
        .from('class_bookings')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .eq('class_id', class_id)
        .eq('session_date', session_date)
        .in('status', ['booked', 'waitlisted']);
      const { sent } = await emailBooked(
        supabase,
        rows || [],
        `${className} cancelled — ${session_date}`,
        `We're sorry — the ${className} class on ${session_date} has been cancelled. Apologies for the inconvenience.`
      );
      return ok(res, { cancelled: (rows || []).length, emailed: sent });
    }

    if (op === 'notify') {
      if (!message) return badRequest(res, 'message is required.');
      const { sent } = await emailBooked(supabase, rows || [], subject || `Update: ${className}`, message);
      return ok(res, { emailed: sent });
    }

    return badRequest(res, 'Unknown op.');
  } catch (err) {
    console.error('class-bookings error:', err.message);
    return serverError(res, 'Class bookings operation failed');
  }
}
