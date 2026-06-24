// POST /api/admin/access-action  (Phase 99 §A2 quick actions)
//   { type:'member', id, action:'checkin'|'checkout'|'flag', note?, station_id? }
// Owner/Manager/Reception.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError } from '../../lib/http.js';
import { requireRole } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  const admin = requireRole(req, res, ['owner', 'manager', 'reception']);
  if (!admin) return;

  const { id, action, note, station_id = 'main' } = await readJsonBody(req);
  if (!id || !action) return badRequest(res, 'id and action are required.');

  const supabase = getSupabase();

  try {
    if (action === 'checkin') {
      // Prevent a duplicate open check-in today.
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const { data: open } = await supabase
        .from('checkins')
        .select('id')
        .eq('member_id', id)
        .is('checked_out_at', null)
        .gte('checked_in_at', start.toISOString())
        .maybeSingle();
      if (open) return ok(res, { message: 'Already checked in.' });

      const row = { member_id: id, method: 'face', verified_by: admin.sub, station_id };
      let { error } = await supabase.from('checkins').insert(row);
      if (error && /station_id/.test(error.message)) {
        // station_id column not added yet — insert without it
        delete row.station_id;
        ({ error } = await supabase.from('checkins').insert(row));
      }
      if (error) return serverError(res, error.message);
      return ok(res, { message: 'Checked in — timer started. 💪' });
    }

    if (action === 'checkout') {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const { data: open } = await supabase
        .from('checkins')
        .select('id, checked_in_at')
        .eq('member_id', id)
        .is('checked_out_at', null)
        .gte('checked_in_at', start.toISOString())
        .order('checked_in_at', { ascending: false })
        .maybeSingle();
      if (!open) return ok(res, { message: 'No open session to check out.' });
      const mins = Math.floor((Date.now() - new Date(open.checked_in_at)) / 60000);
      const { error } = await supabase
        .from('checkins')
        .update({ checked_out_at: new Date().toISOString() })
        .eq('id', open.id);
      if (error) return serverError(res, error.message);
      return ok(res, { message: `Checked out — ${Math.floor(mins / 60)}h ${mins % 60}m logged.` });
    }

    if (action === 'flag') {
      const { data: m } = await supabase.from('members').select('staff_notes').eq('id', id).maybeSingle();
      const stamp = new Date().toLocaleString('en-ZA');
      const appended = `${m?.staff_notes ? m.staff_notes + '\n' : ''}[FLAG ${stamp}] ${note || 'Issue flagged at scan.'}`;
      const { error } = await supabase
        .from('members')
        .update({ staff_notes: appended, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) return serverError(res, error.message);
      return ok(res, { message: 'Issue flagged on the member record.' });
    }

    return badRequest(res, 'Unknown action.');
  } catch (err) {
    console.error('access-action error:', err.message);
    return serverError(res, 'Action failed');
  }
}
