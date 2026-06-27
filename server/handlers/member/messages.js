// GET /api/member/messages -> the member's conversation with management
// (their own messages + management replies). Marks management replies as read.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, ok, serverError } from '../../lib/http.js';
import { authenticateMember } from '../../lib/memberauth.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;
  const auth = authenticateMember(req, res);
  if (!auth) return;

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('admin_inbox')
      .select('id, body, title, direction, sender_role, is_read_member, created_at')
      .eq('member_id', auth.sub)
      .eq('kind', 'message')
      .order('created_at', { ascending: true })
      .limit(200);
    if (error) return serverError(res, error.message);

    const unread = (data || []).filter((m) => m.direction === 'out' && !m.is_read_member).length;

    // Mark management replies as read by the member.
    if (unread > 0) {
      await supabase
        .from('admin_inbox')
        .update({ is_read_member: true })
        .eq('member_id', auth.sub)
        .eq('kind', 'message')
        .eq('direction', 'out')
        .eq('is_read_member', false);
    }

    return ok(res, {
      messages: (data || []).map((m) => ({
        id: m.id,
        body: m.body,
        title: m.title,
        from: m.direction === 'out' ? 'management' : 'you',
        at: m.created_at,
      })),
      unread_before: unread,
    });
  } catch (err) {
    console.error('member messages error:', err.message);
    return serverError(res, 'Could not load messages');
  }
}
