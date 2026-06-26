// Staff / admin account management (spec 4.1 RBAC). OWNER ONLY.
//   GET    /api/admin/staff            list staff (no password hashes)
//   POST   /api/admin/staff            create { username, password, role, full_name?, email?, trainer_id? }
//   PATCH  /api/admin/staff?id=...     update role/profile/is_active, optional password reset
//   DELETE /api/admin/staff?id=...     remove an account
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError } from '../../lib/http.js';
import { requireRole, hashPassword, ROLES } from '../../lib/auth.js';
import { recordAudit } from '../../lib/audit.js';
import { generateStaffNumber, generateStaffCode } from '../../lib/identifiers.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST', 'PATCH', 'DELETE'])) return;
  const admin = requireRole(req, res, ['owner']);
  if (!admin) return;

  const supabase = getSupabase();
  const id = new URL(req.url, 'http://localhost').searchParams.get('id');

  try {
    if (req.method === 'GET') {
      // select('*') is resilient to columns that may not be migrated yet; we
      // strip sensitive fields (password hash, face descriptor) before sending.
      const { data, error } = await supabase
        .from('admin_users')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) return serverError(res, error.message);
      const staff = (data || []).map((s) => ({
        id: s.id,
        username: s.username,
        full_name: s.full_name,
        email: s.email,
        role: s.role,
        is_active: s.is_active,
        last_login_at: s.last_login_at,
        trainer_id: s.trainer_id,
        staff_number: s.staff_number || null,
        verification_code: s.verification_code || null,
        job_title: s.job_title || null,
        phone: s.phone || null,
        photo_url: s.photo_url || null,
        contract_start: s.contract_start || null,
        contract_end: s.contract_end || null,
      }));
      return ok(res, { staff });
    }

    if (req.method === 'POST') {
      const b = await readJsonBody(req);
      if (!b.username || !b.password || !b.role) return badRequest(res, 'Username, password and role are required.');
      if (!ROLES.includes(b.role)) return badRequest(res, 'Invalid role.');
      if (String(b.password).length < 8) return badRequest(res, 'Password must be at least 8 characters.');
      const password_hash = await hashPassword(b.password);

      // Issue a staff number + verification code (needs the migrated columns).
      let staff_number = null;
      let verification_code = null;
      try {
        staff_number = await generateStaffNumber(supabase);
        verification_code = await generateStaffCode(supabase);
      } catch {
        /* columns not migrated yet — account is still created below */
      }

      const base = {
        username: b.username.trim(),
        full_name: b.full_name || null,
        email: b.email || null,
        role: b.role,
        trainer_id: b.trainer_id || null,
        password_hash,
        is_active: true,
        face_descriptor: b.face_descriptor || null,
      };
      const full = {
        ...base,
        staff_number,
        verification_code,
        job_title: b.job_title || null,
        phone: b.phone || null,
        photo_url: b.photo_url || null,
        contract_start: b.contract_start || null,
        contract_end: b.contract_end || null,
      };

      // Try the full credential insert; fall back to a basic account if the
      // credential columns aren't migrated on this gym's database yet.
      let { data, error } = await supabase.from('admin_users').insert(full).select('id').single();
      if (error && !/duplicate|unique/i.test(error.message)) {
        ({ data, error } = await supabase.from('admin_users').insert(base).select('id').single());
        staff_number = null;
        verification_code = null;
      }
      if (error) return serverError(res, /duplicate|unique/i.test(error.message) ? 'That username already exists.' : error.message);

      await recordAudit(supabase, admin, { action: 'staff.create', entity: 'admin_user', entity_id: data.id, detail: `${b.username} (${b.role})` });
      return ok(res, { id: data.id, staff_number, verification_code });
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
