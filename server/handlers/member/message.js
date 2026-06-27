// POST /api/member/message  { subject, body }  -> sends a message to gym
// management (lands in the admin inbox). Authenticated members only.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError } from '../../lib/http.js';
import { authenticateMember } from '../../lib/memberauth.js';
import { notifyAdmin } from '../../lib/inbox.js';
import { rateLimit } from '../../lib/ratelimit.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  const auth = authenticateMember(req, res);
  if (!auth) return;
  if (!(await rateLimit(req, res, { key: 'member-message', limit: 8, windowMs: 60_000 }))) return;

  try {
    const { subject, body } = await readJsonBody(req);
    const text = (body || '').trim();
    if (!text) return badRequest(res, 'Please write a message.');

    const supabase = getSupabase();
    const { data: member } = await supabase
      .from('members')
      .select('id, full_name, membership_number')
      .eq('id', auth.sub)
      .maybeSingle();
    if (!member) return badRequest(res, 'Member not found.');

    const r = await notifyAdmin(supabase, {
      kind: 'message',
      type: 'member.message',
      title: (subject || '').trim() || 'Message from member',
      body: text,
      member_id: member.id,
      sender_name: `${member.full_name} (${member.membership_number})`,
      sender_role: 'member',
      link: `/admin/members/${member.id}`,
    });
    if (!r.ok) return serverError(res, 'Could not send your message. Please try again.');
    return ok(res, { sent: true, message: 'Your message has been sent to management.' });
  } catch (err) {
    console.error('member message error:', err.message);
    return serverError(res, 'Could not send your message.');
  }
}
