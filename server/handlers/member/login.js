// POST /api/member/login  { membership_number, phone }  -> { token, member }
// Existing-member sign in (spec 2.4). Verifies the membership number and phone
// match, then issues a member session token.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, unauthorized, serverError, failed } from '../../lib/http.js';
import { signMemberToken, phoneMatches } from '../../lib/memberauth.js';
import { rateLimit } from '../../lib/ratelimit.js';
import { currentGym } from '../../lib/tenancy.js';
import { issueSessionCookie } from '../../lib/session-cookie.js';

// The gym this login happened in, stamped into the token so every later
// request carries it in a signature the client cannot edit. null in
// single-gym mode, which leaves the token exactly as it was before.
const gymSlug = () => currentGym()?.gym?.slug ?? null;

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  if (!(await rateLimit(req, res, { key: 'member-login', limit: 10, windowMs: 60_000 }))) return;
  try {
    const { membership_number, phone, remember } = await readJsonBody(req);
    if (!membership_number || !phone) {
      return badRequest(res, 'Membership number and phone number are required.');
    }

    const supabase = getSupabase();
    const { data: member, error } = await supabase
      .from('members')
      .select('id, full_name, membership_number, phone, status, session_version')
      .eq('membership_number', membership_number.trim().toUpperCase())
      .maybeSingle();
    if (error) return failed(res, error);

    // phoneMatches, not a plain comparison: phones are stored +27…, and people
    // type 082… (see memberauth.js).
    if (!member || !phoneMatches(member.phone, phone)) {
      return unauthorized(res, 'We could not find a matching membership. Please check your details.');
    }

    // `remember`: the app keeps its members signed in until they sign out (§38.1 Q2).
    const token = signMemberToken(member, { gym: gymSlug(), remember: remember === true });
    // The website keeps it in an HttpOnly cookie (CLAUDE.md §46.1 Q1).
    issueSessionCookie(req, res, 'member', token);
    return ok(res, {
      token,
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
