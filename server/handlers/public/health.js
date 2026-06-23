// GET /api/health -> verifies the function runtime and Supabase connectivity.
// Useful to confirm env vars + the "gym" schema are wired correctly after deploy.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, ok, serverError } from '../../lib/http.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;
  try {
    const supabase = getSupabase();
    // Cheap query against the gym schema to prove the connection + schema work.
    const { error } = await supabase.from('settings').select('id', { count: 'exact', head: true });
    if (error) return serverError(res, `DB error: ${error.message}`);
    return ok(res, { status: 'ok', schema: process.env.SUPABASE_SCHEMA || 'gym', time: new Date().toISOString() });
  } catch (err) {
    return serverError(res, err.message);
  }
}
