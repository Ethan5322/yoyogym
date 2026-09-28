// Gym configuration (spec 4.13). OWNER ONLY (managers have full access except
// settings, per spec 4.1).
//   GET /api/admin/settings           -> { settings: { key: value, ... } }
//   PUT /api/admin/settings  { key, value, category }  -> upsert one setting
//   POST /api/admin/settings?upload=cover  -> a one-time upload link for the
//        gym's cover picture (CLAUDE.md §38.1 Q4, Q5)
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError } from '../../lib/http.js';
import { requireRole } from '../../lib/auth.js';
import { recordAudit } from '../../lib/audit.js';
import { currentGym } from '../../lib/tenancy.js';

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

/** Where gyms' cover pictures live: a public, images-only bucket (§38.1 Q5). */
export const BRANDING_BUCKET = 'gym-branding';

/** This gym's folder in the bucket: its slug, or `default` in single-gym mode. */
const gymFolder = () => String(currentGym()?.gym?.slug || 'default').toLowerCase();

/**
 * Why a cover picture would be refused, or null if it is fine. It must be a
 * picture in THIS gym's own folder of the branding bucket — so one gym can
 * never point its members at another gym's picture, or at anything else.
 */
export function coverProblem(coverUrl, folderPrefix) {
  if (coverUrl == null || coverUrl === '') return null;
  const v = String(coverUrl);
  if (!folderPrefix || !v.startsWith(folderPrefix)) return 'That cover picture is not one uploaded for this gym.';
  // Only a file this system names itself: `cover-<time>.jpg`. No `..`, no subfolders.
  if (!/^cover-\d+\.jpg$/.test(v.slice(folderPrefix.length))) return 'That cover picture address is not valid.';
  return null;
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'PUT', 'POST'])) return;
  const admin = requireRole(req, res, ['owner']);
  if (!admin) return;

  const supabase = getSupabase();

  const bucket = () => supabase.storage.from(BRANDING_BUCKET);
  const folderPrefix = () => bucket().getPublicUrl(`${gymFolder()}/`).data.publicUrl;

  try {
    // A one-time link to upload the gym's cover picture straight to storage —
    // the bytes never pass through this function. The browser shrinks the
    // picture to a JPEG first; the bucket itself refuses anything but images
    // and anything over 2 MB.
    if (req.method === 'POST') {
      if (new URL(req.url, 'http://localhost').searchParams.get('upload') !== 'cover') {
        return badRequest(res, 'Unknown upload.');
      }
      const path = `${gymFolder()}/cover-${Date.now()}.jpg`;
      const { data, error } = await bucket().createSignedUploadUrl(path);
      if (error) return serverError(res, `Could not prepare the upload: ${error.message}`);
      return ok(res, {
        upload_url: data.signedUrl,
        token: data.token,
        public_url: bucket().getPublicUrl(path).data.publicUrl,
      });
    }

    if (req.method === 'PUT') {
      const { key, value, category } = await readJsonBody(req);
      if (!key) return badRequest(res, 'key is required.');
      if (key === 'gym_profile') {
        const problem = logoProblem(value?.logo_url) || coverProblem(value?.cover_url, folderPrefix());
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
