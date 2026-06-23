// Gym configuration (spec 4.13). OWNER ONLY (managers have full access except
// settings, per spec 4.1).
//   GET /api/admin/settings           -> { settings: { key: value, ... } }
//   PUT /api/admin/settings  { key, value, category }  -> upsert one setting
import { getSupabase } from '../../_lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError } from '../../_lib/http.js';
import { requireRole } from '../../_lib/auth.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'PUT'])) return;
  const admin = requireRole(req, res, ['owner']);
  if (!admin) return;

  const supabase = getSupabase();

  try {
    if (req.method === 'PUT') {
      const { key, value, category } = await readJsonBody(req);
      if (!key) return badRequest(res, 'key is required.');
      const { error } = await supabase.from('settings').upsert(
        { key, value: value ?? {}, category: category || null, updated_by: admin.sub, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );
      if (error) return serverError(res, error.message);
      return ok(res, { saved: true });
    }

    const { data, error } = await supabase.from('settings').select('key, value, category');
    if (error) return serverError(res, error.message);
    const settings = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
    return ok(res, { settings });
  } catch (err) {
    console.error('settings error:', err.message);
    return serverError(res, 'Settings operation failed');
  }
}
