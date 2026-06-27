// GET /api/admin/notifications -> recent notification sends (email/WhatsApp/etc.)
// from notifications_log, so staff can see what was sent, to whom, and whether
// it succeeded (corporate audit/trust). Owner/Manager.
//   Query: template_key, status, limit
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, ok, serverError } from '../../lib/http.js';
import { requireRole } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;
  if (!requireRole(req, res, ['owner', 'manager'])) return;

  try {
    const url = new URL(req.url, 'http://localhost');
    const templateKey = url.searchParams.get('template_key');
    const status = url.searchParams.get('status');
    const limit = Math.min(200, parseInt(url.searchParams.get('limit') || '100', 10));

    const supabase = getSupabase();
    let q = supabase
      .from('notifications_log')
      .select('id, recipient, channel, template_key, subject, status, error_message, sent_at, created_at, members(full_name, membership_number)')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (templateKey) q = q.eq('template_key', templateKey);
    if (status) q = q.eq('status', status);

    const { data, error } = await q;
    if (error) return serverError(res, error.message);

    return ok(res, {
      notifications: (data || []).map((n) => ({
        id: n.id,
        recipient: n.recipient,
        member_name: n.members?.full_name || null,
        membership_number: n.members?.membership_number || null,
        channel: n.channel,
        template_key: n.template_key,
        subject: n.subject,
        status: n.status,
        error_message: n.error_message,
        at: n.sent_at || n.created_at,
      })),
    });
  } catch (err) {
    console.error('notifications view error:', err.message);
    return serverError(res, 'Could not load notifications');
  }
}
