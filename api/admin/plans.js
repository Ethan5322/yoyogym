// Membership plan management (spec 4.13 — Membership Plans). Owner/Manager.
//   GET / POST / PATCH?id / DELETE?id
import { getSupabase } from '../_lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError } from '../_lib/http.js';
import { requireRole } from '../_lib/auth.js';

const FIELDS = [
  'name', 'tier', 'visit_type', 'description', 'benefits', 'monthly_price', 'joining_fee',
  'promo_joining_fee', 'classes_included', 'pt_sessions_incl', 'session_pack_size',
  'session_pack_price', 'day_pass_price', 'trial_days', 'trial_price', 'is_featured',
  'is_enabled', 'sort_order',
];
const pick = (b) =>
  Object.fromEntries(FIELDS.filter((f) => b[f] !== undefined).map((f) => [f, b[f] === '' ? null : b[f]]));

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST', 'PATCH', 'DELETE'])) return;
  if (!requireRole(req, res, ['owner', 'manager'])) return;

  const supabase = getSupabase();
  const id = new URL(req.url, 'http://localhost').searchParams.get('id');

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('plans').select('*').order('sort_order');
      if (error) return serverError(res, error.message);
      return ok(res, { plans: data || [] });
    }
    if (req.method === 'POST') {
      const body = pick(await readJsonBody(req));
      if (!body.name) return badRequest(res, 'Plan name is required.');
      const { data, error } = await supabase.from('plans').insert(body).select('id').single();
      if (error) return serverError(res, error.message);
      return ok(res, { id: data.id });
    }
    if (req.method === 'PATCH') {
      if (!id) return badRequest(res, 'id is required.');
      const body = pick(await readJsonBody(req));
      body.updated_at = new Date().toISOString();
      const { error } = await supabase.from('plans').update(body).eq('id', id);
      if (error) return serverError(res, error.message);
      return ok(res, { updated: true });
    }
    if (req.method === 'DELETE') {
      if (!id) return badRequest(res, 'id is required.');
      const { error } = await supabase.from('plans').delete().eq('id', id);
      if (error) return serverError(res, error.message);
      return ok(res, { deleted: true });
    }
  } catch (err) {
    console.error('plans admin error:', err.message);
    return serverError(res, 'Plan operation failed');
  }
}
