// GET    /api/member/progress -> the member's progress entries (newest first)
// POST   /api/member/progress -> add an entry { recorded_on?, weight_kg, ... }
// DELETE /api/member/progress?id=... -> remove an entry
// Members track their own weight & body measurements over time.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError } from '../../lib/http.js';
import { authenticateMember } from '../../lib/memberauth.js';

const NUM = ['weight_kg', 'body_fat_pct', 'chest_cm', 'waist_cm', 'hips_cm', 'arms_cm', 'thighs_cm'];
const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST', 'DELETE'])) return;
  const auth = authenticateMember(req, res);
  if (!auth) return;

  const supabase = getSupabase();

  try {
    if (req.method === 'POST') {
      const b = await readJsonBody(req);
      const row = { member_id: auth.sub, note: (b.note || '').trim() || null };
      if (b.recorded_on) row.recorded_on = b.recorded_on;
      for (const k of NUM) row[k] = num(b[k]);
      if (NUM.every((k) => row[k] == null) && !row.note) return badRequest(res, 'Enter at least one measurement.');
      const { error } = await supabase.from('progress_entries').insert(row);
      if (error) return serverError(res, error.message);
      return ok(res, { saved: true, message: 'Progress saved.' });
    }

    if (req.method === 'DELETE') {
      const id = new URL(req.url, 'http://localhost').searchParams.get('id');
      if (!id) return badRequest(res, 'id is required.');
      const { error } = await supabase.from('progress_entries').delete().eq('id', id).eq('member_id', auth.sub);
      if (error) return serverError(res, error.message);
      return ok(res, { deleted: true });
    }

    const { data, error } = await supabase
      .from('progress_entries')
      .select('*')
      .eq('member_id', auth.sub)
      .order('recorded_on', { ascending: false })
      .limit(100);
    if (error) return serverError(res, error.message);
    return ok(res, { entries: data || [] });
  } catch (err) {
    console.error('member progress error:', err.message);
    return serverError(res, 'Could not load progress');
  }
}
