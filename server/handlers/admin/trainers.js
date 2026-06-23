// Trainer management CRUD (spec 4.8). Owner/Manager.
//   GET / POST / PATCH?id / DELETE?id
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError } from '../../lib/http.js';
import { requireRole } from '../../lib/auth.js';

const FIELDS = ['full_name', 'phone', 'email', 'specialization', 'certifications', 'bio', 'is_active'];
const pick = (b) => Object.fromEntries(FIELDS.filter((f) => b[f] !== undefined).map((f) => [f, b[f]]));

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST', 'PATCH', 'DELETE'])) return;
  if (!requireRole(req, res, ['owner', 'manager'])) return;

  const supabase = getSupabase();
  const id = new URL(req.url, 'http://localhost').searchParams.get('id');

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('trainers').select('*').order('full_name');
      if (error) return serverError(res, error.message);
      return ok(res, { trainers: data || [] });
    }
    if (req.method === 'POST') {
      const body = pick(await readJsonBody(req));
      if (!body.full_name) return badRequest(res, 'Trainer name is required.');
      const { data, error } = await supabase.from('trainers').insert(body).select('id').single();
      if (error) return serverError(res, error.message);
      return ok(res, { id: data.id });
    }
    if (req.method === 'PATCH') {
      if (!id) return badRequest(res, 'id is required.');
      const body = pick(await readJsonBody(req));
      body.updated_at = new Date().toISOString();
      const { error } = await supabase.from('trainers').update(body).eq('id', id);
      if (error) return serverError(res, error.message);
      return ok(res, { updated: true });
    }
    if (req.method === 'DELETE') {
      if (!id) return badRequest(res, 'id is required.');
      const { error } = await supabase.from('trainers').delete().eq('id', id);
      if (error) return serverError(res, error.message);
      return ok(res, { deleted: true });
    }
  } catch (err) {
    console.error('trainers admin error:', err.message);
    return serverError(res, 'Trainer operation failed');
  }
}
