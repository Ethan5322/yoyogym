// GET  /api/admin/profile  -> the signed-in admin's own credential (for their
//                             ID card) — lazily issuing a staff number +
//                             verification code the first time so an owner
//                             seeded without one still gets a proper card.
// POST /api/admin/profile  { photo_url }  -> update the admin's OWN ID photo.
//
// Any authenticated admin may manage their own profile photo (self-service) —
// no owner role required, and there is no limit on how often it can change.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError } from '../../lib/http.js';
import { authenticate } from '../../lib/auth.js';
import { generateStaffNumber, generateStaffCode } from '../../lib/identifiers.js';

const isPhoto = (v) => typeof v === 'string' && (v.startsWith('data:image') || /^https?:\/\//.test(v));

const SELECT =
  'id, username, full_name, email, role, job_title, phone, photo_url, staff_number, verification_code, contract_start, contract_end';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;
  const admin = authenticate(req, res);
  if (!admin) return;

  const supabase = getSupabase();

  try {
    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      if (!isPhoto(body.photo_url)) return badRequest(res, 'A valid photo is required.');
      const { error } = await supabase
        .from('admin_users')
        .update({ photo_url: body.photo_url, updated_at: new Date().toISOString() })
        .eq('id', admin.sub);
      if (error) return serverError(res, error.message);
      return ok(res, { updated: true });
    }

    // GET — load own record, issuing card identifiers on first view.
    const { data: me, error } = await supabase
      .from('admin_users')
      .select(SELECT)
      .eq('id', admin.sub)
      .maybeSingle();
    if (error) return serverError(res, error.message);
    if (!me) return badRequest(res, 'Account not found.');

    const patch = {};
    if (!me.staff_number) patch.staff_number = await generateStaffNumber(supabase);
    if (!me.verification_code) patch.verification_code = await generateStaffCode(supabase);
    if (Object.keys(patch).length) {
      await supabase.from('admin_users').update(patch).eq('id', admin.sub);
      Object.assign(me, patch);
    }

    return ok(res, { profile: me });
  } catch (err) {
    console.error('profile error:', err.message);
    return serverError(res, 'Could not load your profile');
  }
}
