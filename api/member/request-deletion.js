// POST /api/member/request-deletion -> flags the member's record for data
// deletion (POPIA right to erasure, spec NOTES). Admin reviews & erases.
import { getSupabase } from '../_lib/supabase.js';
import { allowMethods, ok, serverError } from '../_lib/http.js';
import { authenticateMember } from '../_lib/memberauth.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  const auth = authenticateMember(req, res);
  if (!auth) return;
  try {
    const supabase = getSupabase();
    const { error } = await supabase
      .from('members')
      .update({ data_deletion_requested: true, updated_at: new Date().toISOString() })
      .eq('id', auth.sub);
    if (error) return serverError(res, error.message);
    return ok(res, { requested: true, message: 'Your data deletion request has been recorded. Our team will action it.' });
  } catch (err) {
    console.error('request-deletion error:', err.message);
    return serverError(res, 'Request failed');
  }
}
