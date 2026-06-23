// Calendar events & blocked days (spec 4.11). Owner/Manager.
//   GET    /api/admin/events?from=&to=
//   POST   /api/admin/events           { title, type, event_date, end_date, start_time, description }
//   DELETE /api/admin/events?id=...
import { getSupabase } from '../_lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError } from '../_lib/http.js';
import { requireRole } from '../_lib/auth.js';

const FIELDS = ['title', 'type', 'event_date', 'end_date', 'start_time', 'description'];
const pick = (b) => Object.fromEntries(FIELDS.filter((f) => b[f] !== undefined && b[f] !== '').map((f) => [f, b[f]]));

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST', 'DELETE'])) return;
  const admin = requireRole(req, res, ['owner', 'manager']);
  if (!admin) return;

  const supabase = getSupabase();
  const url = new URL(req.url, 'http://localhost');

  try {
    if (req.method === 'GET') {
      let q = supabase.from('events').select('*').order('event_date', { ascending: true });
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      if (from) q = q.gte('event_date', from);
      if (to) q = q.lte('event_date', to);
      const { data, error } = await q;
      if (error) return serverError(res, error.message);
      return ok(res, { events: data || [] });
    }

    if (req.method === 'POST') {
      const body = pick(await readJsonBody(req));
      if (!body.title || !body.event_date) return badRequest(res, 'title and event_date are required.');
      const { data, error } = await supabase.from('events').insert({ ...body, created_by: admin.sub }).select('id').single();
      if (error) return serverError(res, error.message);
      return ok(res, { id: data.id });
    }

    if (req.method === 'DELETE') {
      const id = url.searchParams.get('id');
      if (!id) return badRequest(res, 'id is required.');
      const { error } = await supabase.from('events').delete().eq('id', id);
      if (error) return serverError(res, error.message);
      return ok(res, { deleted: true });
    }
  } catch (err) {
    console.error('events error:', err.message);
    return serverError(res, 'Events operation failed');
  }
}
