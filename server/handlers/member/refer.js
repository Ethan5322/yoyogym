// GET  /api/member/refer -> the member's referrals
// POST /api/member/refer -> refer a friend { friend_name, friend_phone, friend_email }
// Lands a referral in the program + notifies management (admin inbox).
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError } from '../../lib/http.js';
import { authenticateMember } from '../../lib/memberauth.js';
import { notifyAdmin } from '../../lib/inbox.js';
import { rateLimit } from '../../lib/ratelimit.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;
  const auth = authenticateMember(req, res);
  if (!auth) return;

  const supabase = getSupabase();

  try {
    if (req.method === 'POST') {
      if (!(await rateLimit(req, res, { key: 'member-refer', limit: 10, windowMs: 60_000 }))) return;
      const { friend_name, friend_phone, friend_email } = await readJsonBody(req);
      if (!friend_name?.trim()) return badRequest(res, 'Your friend’s name is required.');
      if (!friend_phone && !friend_email) return badRequest(res, 'Add a phone or email so we can reach them.');

      const { data: member } = await supabase
        .from('members')
        .select('id, full_name, membership_number')
        .eq('id', auth.sub)
        .maybeSingle();

      const { error } = await supabase.from('referrals').insert({
        referrer_member_id: auth.sub,
        referrer_name: member ? `${member.full_name} (${member.membership_number})` : null,
        friend_name: friend_name.trim(),
        friend_phone: (friend_phone || '').trim() || null,
        friend_email: (friend_email || '').trim() || null,
      });
      if (error) return serverError(res, error.message);

      await notifyAdmin(supabase, {
        kind: 'event',
        type: 'referral',
        title: `${member?.full_name || 'A member'} referred ${friend_name.trim()}`,
        body: [friend_phone, friend_email].filter(Boolean).join(' · ') || null,
        member_id: auth.sub,
        sender_name: member ? `${member.full_name} (${member.membership_number})` : null,
        sender_role: 'member',
        link: `/admin/members/${auth.sub}`,
      });
      return ok(res, { sent: true, message: 'Thanks! We’ll reach out to your friend.' });
    }

    const { data, error } = await supabase
      .from('referrals')
      .select('friend_name, status, created_at')
      .eq('referrer_member_id', auth.sub)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return serverError(res, error.message);
    return ok(res, { referrals: data || [] });
  } catch (err) {
    console.error('member refer error:', err.message);
    return serverError(res, 'Could not submit referral');
  }
}
