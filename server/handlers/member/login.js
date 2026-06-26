// POST /api/member/login  { membership_number, phone }  -> { token, member }
// Existing-member sign in (spec 2.4). Verifies the membership number and phone
// match, then issues a member session token.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, unauthorized, serverError } from '../../lib/http.js';
import { signMemberToken, normalizePhone } from '../../lib/memberauth.js';
import { rateLimit } from '../../lib/ratelimit.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  if (!(await rateLimit(req, res, { key: 'member-login', limit: 10, windowMs: 60_000 }))) return;
  try {
    const { membership_number, phone } = await readJsonBody(req);
    if (!membership_number || !phone) {
      return badRequest(res, 'Membership number and phone number are required.');
    }

    const supabase = getSupabase();
    const { data: member, error } = await supabase
      .from('members')
      .select('id, full_name, membership_number, phone, status')
      .eq('membership_number', membership_number.trim().toUpperCase())
      .maybeSingle();
    if (error) return serverError(res, error.message);

    if (!member || normalizePhone(member.phone) !== normalizePhone(phone)) {
      return unauthorized(res, 'We could not find a matching membership. Please check your details.');
    }

    return ok(res, {
      token: signMemberToken(member),
      member: {
        id: member.id,
        full_name: member.full_name,
        membership_number: member.membership_number,
        status: member.status,
      },
    });
  } catch (err) {
    console.error('member login error:', err.message);
    return serverError(res, 'Sign in failed');
  }
}
