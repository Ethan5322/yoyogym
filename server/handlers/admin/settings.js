// Gym configuration (spec 4.13). OWNER ONLY (managers have full access except
// settings, per spec 4.1).
//   GET /api/admin/settings           -> { settings: { key: value, ... } }
//   PUT /api/admin/settings  { key, value, category }  -> upsert one setting
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError } from '../../lib/http.js';
import { requireRole } from '../../lib/auth.js';
import { recordAudit } from '../../lib/audit.js';

/** The most a gym's logo may weigh: it is sent to every member on every visit. */
const LOGO_MAX_CHARS = 300 * 1024;

/**
 * Why a gym logo would be refused, or null if it is fine. A logo is either a
 * link to an image the gym hosts (https) or an uploaded PNG / JPEG / WebP
 * (CLAUDE.md §37.1 Q6). Nothing else — never SVG, which can carry script.
 */
export function logoProblem(logoUrl) {
  if (logoUrl == null || logoUrl === '') return null;
  const v = String(logoUrl);
  if (v.length > LOGO_MAX_CHARS) return 'That logo is too large. Upload a smaller image.';
  if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v)) return null;
  if (/^https:\/\/[^\s"'<>]+$/.test(v)) return null;
  return 'A logo must be a PNG, JPG or WebP image, or an https:// link to one.';
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'PUT'])) return;
  const admin = requireRole(req, res, ['owner']);
  if (!admin) return;

  const supabase = getSupabase();

  try {
    if (req.method === 'PUT') {
      const { key, value, category } = await readJsonBody(req);
      if (!key) return badRequest(res, 'key is required.');
      if (key === 'gym_profile') {
        const problem = logoProblem(value?.logo_url);
        if (problem) return badRequest(res, problem);
      }
      const { error } = await supabase.from('settings').upsert(
        { key, value: value ?? {}, category: category || null, updated_by: admin.sub, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );
      if (error) return serverError(res, error.message);
      await recordAudit(supabase, admin, { action: 'settings.save', entity: 'settings', entity_id: key });
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
