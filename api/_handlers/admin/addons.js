// Add-on services management (spec 4.13 — Add-On Services). Owner/Manager.
//   GET / POST / PATCH?id / DELETE?id
import { getSupabase } from '../../_lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError } from '../../_lib/http.js';
import { requireRole } from '../../_lib/auth.js';

const FIELDS = ['name', 'category', 'description', 'price', 'billing_type', 'is_enabled'];
const pick = (b) => Object.fromEntries(FIELDS.filter((f) => b[f] !== undefined).map((f) => [f, b[f]]));

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST', 'PATCH', 'DELETE'])) return;
  if (!requireRole(req, res, ['owner', 'manager'])) return;

  const supabase = getSupabase();
  const id = new URL(req.url, 'http://localhost').searchParams.get('id');

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('addon_services').select('*').order('category');
      if (error) return serverError(res, error.message);
      return ok(res, { addons: data || [] });
    }
    if (req.method === 'POST') {
      const body = pick(await readJsonBody(req));
      if (!body.name) return badRequest(res, 'Add-on name is required.');
      const { data, error } = await supabase.from('addon_services').insert(body).select('id').single();
      if (error) return serverError(res, error.message);
      return ok(res, { id: data.id });
    }
    if (req.method === 'PATCH') {
      if (!id) return badRequest(res, 'id is required.');
      const body = pick(await readJsonBody(req));
      body.updated_at = new Date().toISOString();
      const { error } = await supabase.from('addon_services').update(body).eq('id', id);
      if (error) return serverError(res, error.message);
      return ok(res, { updated: true });
    }
    if (req.method === 'DELETE') {
      if (!id) return badRequest(res, 'id is required.');
      const { error } = await supabase.from('addon_services').delete().eq('id', id);
      if (error) return serverError(res, error.message);
      return ok(res, { deleted: true });
    }
  } catch (err) {
    console.error('addons admin error:', err.message);
    return serverError(res, 'Add-on operation failed');
  }
}
