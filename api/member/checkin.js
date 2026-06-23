// POST /api/member/checkin -> logs a gym attendance check-in for the member
// (spec 2.4 A). Blocks if the membership is not active and prevents a duplicate
// open check-in (already inside the gym).
import { getSupabase } from '../_lib/supabase.js';
import { allowMethods, ok, badRequest, serverError } from '../_lib/http.js';
import { authenticateMember } from '../_lib/memberauth.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  const auth = authenticateMember(req, res);
  if (!auth) return;

  try {
    const supabase = getSupabase();

    const { data: member } = await supabase
      .from('members')
      .select('status')
      .eq('id', auth.sub)
      .maybeSingle();
    if (!member) return badRequest(res, 'Member not found.');
    if (member.status !== 'active') {
      return badRequest(res, 'Your membership is not active. Please see reception.');
    }

    // Prevent a second check-in while one is still open today.
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const { data: open } = await supabase
      .from('checkins')
      .select('id')
      .eq('member_id', auth.sub)
      .is('checked_out_at', null)
      .gte('checked_in_at', startOfDay.toISOString())
      .maybeSingle();
    if (open) return ok(res, { already_checked_in: true, message: 'You are already checked in. Have a great session!' });

    const { error } = await supabase
      .from('checkins')
      .insert({ member_id: auth.sub, method: 'self' });
    if (error) return serverError(res, error.message);

    return ok(res, { checked_in: true, message: 'Checked in — enjoy your workout! 💪' });
  } catch (err) {
    console.error('checkin error:', err.message);
    return serverError(res, 'Check-in failed');
  }
}
