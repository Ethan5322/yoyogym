// Membership plan management (spec 4.13 — Membership Plans). Owner/Manager.
//   GET / POST / PATCH?id / DELETE?id
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError, failed } from '../../lib/http.js';
import { requireRole } from '../../lib/auth.js';
import { planPriceMissing } from '../../../shared/pricing.js';

// A plan goes on sale only with its price (CLAUDE.md §45.1 Q1): a new gym's
// starter plans arrive switched off and unpriced.
const NO_PRICE = "Set this plan's price before switching it on — members would otherwise join at no charge. (Zero is allowed for a free plan: type 0.)";

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
      if (error) return failed(res, error);
      return ok(res, { plans: data || [] });
    }
    if (req.method === 'POST') {
      const body = pick(await readJsonBody(req));
      if (!body.name) return badRequest(res, 'Plan name is required.');
      if (body.is_enabled !== false && planPriceMissing({ visit_type: 'full', ...body })) return badRequest(res, NO_PRICE);
      const { data, error } = await supabase.from('plans').insert(body).select('id').single();
      if (error) return failed(res, error);
      return ok(res, { id: data.id });
    }
    if (req.method === 'PATCH') {
      if (!id) return badRequest(res, 'id is required.');
      const body = pick(await readJsonBody(req));
      // Judged on the plan as it WILL be: what is stored, with this change on top.
      const { data: current } = await supabase.from('plans').select('*').eq('id', id).maybeSingle();
      const after = { ...(current || {}), ...body };
      if (after.is_enabled && planPriceMissing(after)) return badRequest(res, NO_PRICE);
      body.updated_at = new Date().toISOString();
      const { error } = await supabase.from('plans').update(body).eq('id', id);
      if (error) return failed(res, error);
      return ok(res, { updated: true });
    }
    if (req.method === 'DELETE') {
      if (!id) return badRequest(res, 'id is required.');
      const { error } = await supabase.from('plans').delete().eq('id', id);
      if (error) return failed(res, error);
      return ok(res, { deleted: true });
    }
  } catch (err) {
    console.error('plans admin error:', err.message);
    return serverError(res, 'Plan operation failed');
  }
}
