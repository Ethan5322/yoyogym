// GET /api/member/announcements -> published gym announcements (news feed).
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
      .from('announcements')
      .select('id, title, body, created_at, created_by_name')
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) return serverError(res, error.message);
    return ok(res, { announcements: data || [] });
  } catch (err) {
    console.error('member announcements error:', err.message);
    return serverError(res, 'Could not load announcements');
  }
}
