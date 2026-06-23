// Class management CRUD (spec 4.7). Owner/Manager.
//   GET    /api/admin/classes            list
//   POST   /api/admin/classes            create
//   PATCH  /api/admin/classes?id=...     update
//   DELETE /api/admin/classes?id=...     delete
import { getSupabase } from '../_lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError } from '../_lib/http.js';
import { requireRole } from '../_lib/auth.js';

const FIELDS = [
  'name', 'trainer_id', 'recurrence', 'day_of_week', 'start_time', 'class_date',
  'duration_minutes', 'max_capacity', 'min_capacity', 'require_booking', 'allowed_tiers', 'is_active',
];

function pick(body) {
  const out = {};
  for (const f of FIELDS) if (body[f] !== undefined) out[f] = body[f] === '' ? null : body[f];
  return out;
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST', 'PATCH', 'DELETE'])) return;
  if (!requireRole(req, res, ['owner', 'manager'])) return;

  const supabase = getSupabase();
  const url = new URL(req.url, 'http://localhost');
  const id = url.searchParams.get('id');

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('classes')
        .select('*, trainers(full_name)')
        .order('day_of_week', { ascending: true });
      if (error) return serverError(res, error.message);
      return ok(res, { classes: data || [] });
    }

    if (req.method === 'POST') {
      const body = pick(await readJsonBody(req));
      if (!body.name) return badRequest(res, 'Class name is required.');
      const { data, error } = await supabase.from('classes').insert(body).select('id').single();
      if (error) return serverError(res, error.message);
      return ok(res, { id: data.id });
    }

    if (req.method === 'PATCH') {
      if (!id) return badRequest(res, 'id is required.');
      const body = pick(await readJsonBody(req));
      body.updated_at = new Date().toISOString();
      const { error } = await supabase.from('classes').update(body).eq('id', id);
      if (error) return serverError(res, error.message);
      return ok(res, { updated: true });
    }

    if (req.method === 'DELETE') {
      if (!id) return badRequest(res, 'id is required.');
      const { error } = await supabase.from('classes').delete().eq('id', id);
      if (error) return serverError(res, error.message);
      return ok(res, { deleted: true });
    }
  } catch (err) {
    console.error('classes admin error:', err.message);
    return serverError(res, 'Class operation failed');
  }
}
