// Security incident logging (Phase 99 §E2). Owner/Manager/Reception.
//   GET  /api/admin/incident   -> recent incidents
//   POST /api/admin/incident   -> log { member_id?, person_label?, note }  (+ owner alert)
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError } from '../../lib/http.js';
import { requireRole } from '../../lib/auth.js';
import { notifyOwner } from '../../lib/notify/index.js';
import { ownerTemplates } from '../../lib/notify/templates.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;
  const admin = requireRole(req, res, ['owner', 'manager', 'reception']);
  if (!admin) return;

  const supabase = getSupabase();

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('incidents')
        .select('*, members(full_name, membership_number), admin_users(full_name)')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) return serverError(res, error.message);
      return ok(res, {
        incidents: (data || []).map((i) => ({
          id: i.id,
          note: i.note,
          person: i.members?.full_name || i.person_label || 'Unidentified',
          membership_number: i.members?.membership_number || null,
          by: i.admin_users?.full_name || 'Staff',
          created_at: i.created_at,
        })),
      });
    }

    // POST
    const { member_id, person_label, note } = await readJsonBody(req);
    if (!note) return badRequest(res, 'A note is required.');
    const { error } = await supabase.from('incidents').insert({
      member_id: member_id || null,
      person_label: person_label || null,
      note,
      admin_id: admin.sub,
    });
    if (error) return serverError(res, error.message);

    await notifyOwner(supabase, 'incident', ownerTemplates.incident({ person: person_label || 'a person', note }));
    return ok(res, { logged: true });
  } catch (err) {
    console.error('incident error:', err.message);
    return serverError(res, 'Incident operation failed');
  }
}
