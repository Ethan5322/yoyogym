// Admin inbox — messages from members/staff + member-action alerts.
//   GET   /api/admin/inbox?kind=&unread=1&limit=   -> { items, unread_count }
//   PATCH /api/admin/inbox?id=...   { is_read }     -> mark one read/unread
//   PATCH /api/admin/inbox?all=1                    -> mark all read
// Owner/Manager.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError } from '../../lib/http.js';
import { requireRole } from '../../lib/auth.js';
import { notifyAdmin } from '../../lib/inbox.js';
import { notifyMemberEmail } from '../../lib/notify/index.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST', 'PATCH'])) return;
  const admin = requireRole(req, res, ['owner', 'manager']);
  if (!admin) return;

  const supabase = getSupabase();
  const url = new URL(req.url, 'http://localhost');

  try {
    if (req.method === 'POST') {
      // Reply to a member (creates an 'out' message in the thread + emails them).
      const b = await readJsonBody(req);
      const text = (b.body || '').trim();
      if (!b.member_id || !text) return badRequest(res, 'member_id and body are required.');

      const { data: member } = await supabase
        .from('members')
        .select('id, full_name, email')
        .eq('id', b.member_id)
        .maybeSingle();
      if (!member) return badRequest(res, 'Member not found.');

      const r = await notifyAdmin(supabase, {
        kind: 'message',
        type: 'admin.reply',
        title: 'Reply from management',
        body: text,
        member_id: member.id,
        sender_name: admin.full_name || admin.username || 'Management',
        sender_role: 'admin',
        direction: 'out',
        parent_id: b.parent_id || null,
        is_read: true,
        is_read_member: false,
        link: `/admin/members/${member.id}`,
      });
      if (!r.ok) return serverError(res, 'Could not send the reply.');

      if (member.email) {
        await notifyMemberEmail(supabase, { id: member.id, full_name: member.full_name, email: member.email }, 'admin_reply', { body: text });
      }
      return ok(res, { sent: true });
    }

    if (req.method === 'PATCH') {
      if (url.searchParams.get('all') === '1') {
        const { error } = await supabase.from('admin_inbox').update({ is_read: true }).eq('is_read', false);
        if (error) return serverError(res, error.message);
        return ok(res, { updated: true });
      }
      const id = url.searchParams.get('id');
      if (!id) return badRequest(res, 'id is required.');
      const b = await readJsonBody(req);
      const { error } = await supabase
        .from('admin_inbox')
        .update({ is_read: b.is_read !== false })
        .eq('id', id);
      if (error) return serverError(res, error.message);
      return ok(res, { updated: true });
    }

    // GET
    const kind = url.searchParams.get('kind');
    const unread = url.searchParams.get('unread');
    const limit = Math.min(200, parseInt(url.searchParams.get('limit') || '100', 10));

    let q = supabase
      .from('admin_inbox')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (kind) q = q.eq('kind', kind);
    if (unread === '1') q = q.eq('is_read', false);

    const [{ data, error }, { count }] = await Promise.all([
      q,
      supabase.from('admin_inbox').select('id', { count: 'exact', head: true }).eq('is_read', false),
    ]);
    if (error) return serverError(res, error.message);

    return ok(res, { items: data || [], unread_count: count || 0 });
  } catch (err) {
    console.error('inbox error:', err.message);
    return serverError(res, 'Could not load inbox');
  }
}
