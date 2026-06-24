// Visitor / guest management (Phase 99 §E1). Owner/Manager/Reception.
//   GET  /api/admin/visitor            -> today's visitors
//   POST /api/admin/visitor            -> issue a day pass { name, phone, host_name }
//   PATCH /api/admin/visitor?id=...    -> mark checked in
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError } from '../../lib/http.js';
import { requireRole } from '../../lib/auth.js';
import { randomInt } from 'node:crypto';

const CODE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const passCode = () => Array.from({ length: 6 }, () => CODE[randomInt(0, CODE.length)]).join('');

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST', 'PATCH'])) return;
  const admin = requireRole(req, res, ['owner', 'manager', 'reception']);
  if (!admin) return;

  const supabase = getSupabase();
  const today = new Date().toISOString().slice(0, 10);

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('visitors')
        .select('*')
        .eq('valid_date', today)
        .order('created_at', { ascending: false });
      if (error) return serverError(res, error.message);
      return ok(res, { visitors: data || [] });
    }

    if (req.method === 'POST') {
      const { name, phone, host_name } = await readJsonBody(req);
      if (!name) return badRequest(res, 'Visitor name is required.');
      const code = passCode();
      const { data, error } = await supabase
        .from('visitors')
        .insert({ name, phone: phone || null, host_name: host_name || null, pass_code: code, valid_date: today, created_by: admin.sub })
        .select('id, name, pass_code, valid_date')
        .single();
      if (error) return serverError(res, error.message);
      return ok(res, { visitor: data });
    }

    if (req.method === 'PATCH') {
      const id = new URL(req.url, 'http://localhost').searchParams.get('id');
      if (!id) return badRequest(res, 'id is required.');
      const { error } = await supabase.from('visitors').update({ checked_in_at: new Date().toISOString() }).eq('id', id);
      if (error) return serverError(res, error.message);
      return ok(res, { checked_in: true });
    }
  } catch (err) {
    console.error('visitor error:', err.message);
    return serverError(res, 'Visitor operation failed');
  }
}
