// Staff / admin account management (spec 4.1 RBAC). OWNER ONLY.
//   GET    /api/admin/staff            list staff (no password hashes)
//   POST   /api/admin/staff            create { username, password, role, full_name?, email?, trainer_id? }
//   PATCH  /api/admin/staff?id=...     update role/profile/is_active, optional password reset
//   DELETE /api/admin/staff?id=...     remove an account
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError } from '../../lib/http.js';
import { requireRole, hashPassword, ROLES } from '../../lib/auth.js';
import { recordAudit } from '../../lib/audit.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST', 'PATCH', 'DELETE'])) return;
  const admin = requireRole(req, res, ['owner']);
  if (!admin) return;

  const supabase = getSupabase();
  const id = new URL(req.url, 'http://localhost').searchParams.get('id');

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('admin_users')
        .select('id, username, full_name, email, role, is_active, last_login_at, trainer_id')
        .order('created_at', { ascending: true });
      if (error) return serverError(res, error.message);
      return ok(res, { staff: data || [] });
    }

    if (req.method === 'POST') {
      const b = await readJsonBody(req);
      if (!b.username || !b.password || !b.role) return badRequest(res, 'Username, password and role are required.');
      if (!ROLES.includes(b.role)) return badRequest(res, 'Invalid role.');
      if (String(b.password).length < 8) return badRequest(res, 'Password must be at least 8 characters.');
      const password_hash = await hashPassword(b.password);
      const { data, error } = await supabase
        .from('admin_users')
        .insert({
          username: b.username.trim(),
          full_name: b.full_name || null,
          email: b.email || null,
          role: b.role,
          trainer_id: b.trainer_id || null,
          password_hash,
          is_active: true,
        })
        .select('id')
        .single();
      if (error) return serverError(res, /duplicate|unique/i.test(error.message) ? 'That username already exists.' : error.message);
      await recordAudit(supabase, admin, { action: 'staff.create', entity: 'admin_user', entity_id: data.id, detail: `${b.username} (${b.role})` });
      return ok(res, { id: data.id });
    }

    if (req.method === 'PATCH') {
      if (!id) return badRequest(res, 'id is required.');
      const b = await readJsonBody(req);
      const patch = { updated_at: new Date().toISOString() };
      if (b.full_name !== undefined) patch.full_name = b.full_name;
      if (b.email !== undefined) patch.email = b.email;
      if (b.trainer_id !== undefined) patch.trainer_id = b.trainer_id || null;
      if (b.role !== undefined) {
        if (!ROLES.includes(b.role)) return badRequest(res, 'Invalid role.');
        if (id === admin.sub && b.role !== 'owner') return badRequest(res, 'You cannot change your own role.');
        patch.role = b.role;
      }
      if (b.is_active !== undefined) {
        if (id === admin.sub && b.is_active === false) return badRequest(res, 'You cannot disable your own account.');
        patch.is_active = !!b.is_active;
      }
      if (b.password) {
        if (String(b.password).length < 8) return badRequest(res, 'Password must be at least 8 characters.');
        patch.password_hash = await hashPassword(b.password);
        patch.failed_logins = 0;
        patch.locked_until = null;
      }
      const { error } = await supabase.from('admin_users').update(patch).eq('id', id);
      if (error) return serverError(res, error.message);
      await recordAudit(supabase, admin, { action: 'staff.update', entity: 'admin_user', entity_id: id, detail: b.password ? 'password reset' : 'profile/role updated' });
      return ok(res, { updated: true });
    }

    if (req.method === 'DELETE') {
      if (!id) return badRequest(res, 'id is required.');
      if (id === admin.sub) return badRequest(res, 'You cannot delete your own account.');
      const { error } = await supabase.from('admin_users').delete().eq('id', id);
      if (error) return serverError(res, error.message);
      await recordAudit(supabase, admin, { action: 'staff.delete', entity: 'admin_user', entity_id: id });
      return ok(res, { deleted: true });
    }
  } catch (err) {
    console.error('staff error:', err.message);
    return serverError(res, 'Staff operation failed');
  }
}
