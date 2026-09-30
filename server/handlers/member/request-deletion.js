// POST /api/member/request-deletion — "Delete my account", from the app or the
// member area (CLAUDE.md §46.1 Q3; POPIA's right to erasure; both stores
// require it inside the app). The gym sees the request at once and may erase
// sooner; on day 30 the morning job erases it (cron/erase-requested.js).
// Asking twice does not restart the 30 days.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, ok, serverError } from '../../lib/http.js';
import { authenticateMember } from '../../lib/memberauth.js';
import { deleteBy } from '../../lib/member-erasure.js';

const NOT_RECORDED = 'We could not record your request just now. Please try again in a moment.';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  const auth = authenticateMember(req, res);
  if (!auth) return;
  try {
    const supabase = getSupabase();
    const now = new Date().toISOString();
    const { data: current, error: readErr } = await supabase
      .from('members')
      .select('data_deletion_requested_at')
      .eq('id', auth.sub)
      .maybeSingle();
    if (readErr) {
      // Never the raw database message — a member was once shown "column
      // members.data_deletion_requested does not exist". The cause goes to
      // the log.
      console.error('request-deletion error:', readErr.message);
      return serverError(res, NOT_RECORDED);
    }
    const requestedAt = current?.data_deletion_requested_at || now;
    const { error } = await supabase
      .from('members')
      .update({ data_deletion_requested: true, data_deletion_requested_at: requestedAt, updated_at: now })
      .eq('id', auth.sub);
    if (error) {
      console.error('request-deletion error:', error.message);
      return serverError(res, NOT_RECORDED);
    }
    const by = deleteBy(requestedAt);
    const date = by.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    return ok(res, {
      requested: true,
      delete_by: by.toISOString().slice(0, 10),
      message: `Your account will be deleted by ${date}. Your gym may do it sooner. If we have your email address, you will get an email when it is done.`,
    });
  } catch (err) {
    console.error('request-deletion error:', err.message);
    return serverError(res, NOT_RECORDED);
  }
}
