// Gym announcements (management -> members news feed). Owner/Manager.
//   GET    /api/admin/announcements          list (newest first)
//   POST   /api/admin/announcements          { title, body, is_published }
//   PATCH  /api/admin/announcements?id=...    { is_published }
//   DELETE /api/admin/announcements?id=...
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError } from '../../lib/http.js';
import { requireRole } from '../../lib/auth.js';
import { recordAudit } from '../../lib/audit.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST', 'PATCH', 'DELETE'])) return;
  const admin = requireRole(req, res, ['owner', 'manager']);
  if (!admin) return;

  const supabase = getSupabase();
  const id = new URL(req.url, 'http://localhost').searchParams.get('id');

  try {
    if (req.method === 'POST') {
      const { title, body, is_published } = await readJsonBody(req);
      if (!title?.trim()) return badRequest(res, 'A title is required.');
      const { data, error } = await supabase
        .from('announcements')
        .insert({
          title: title.trim(),
          body: (body || '').trim() || null,
          is_published: is_published !== false,
          created_by: admin.sub,
          created_by_name: admin.full_name || admin.username || 'Management',
        })
        .select('id')
        .single();
      if (error) return serverError(res, error.message);
      await recordAudit(supabase, admin, { action: 'announcement.create', entity: 'announcement', entity_id: data.id, detail: title.trim() });
      return ok(res, { id: data.id });
    }

    if (req.method === 'PATCH') {
      if (!id) return badRequest(res, 'id is required.');
      const b = await readJsonBody(req);
      const { error } = await supabase.from('announcements').update({ is_published: b.is_published !== false }).eq('id', id);
      if (error) return serverError(res, error.message);
      return ok(res, { updated: true });
    }

    if (req.method === 'DELETE') {
      if (!id) return badRequest(res, 'id is required.');
      const { error } = await supabase.from('announcements').delete().eq('id', id);
      if (error) return serverError(res, error.message);
      await recordAudit(supabase, admin, { action: 'announcement.delete', entity: 'announcement', entity_id: id });
      return ok(res, { deleted: true });
    }

    const { data, error } = await supabase
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) return serverError(res, error.message);
    return ok(res, { announcements: data || [] });
  } catch (err) {
    console.error('announcements error:', err.message);
    return serverError(res, 'Announcements operation failed');
  }
}
