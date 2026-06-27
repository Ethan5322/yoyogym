// GET   /api/member/profile  -> the member's editable contact details
// PATCH /api/member/profile  -> update own contact details (self-service)
// Only safe contact fields are editable — never name, ID, status or billing.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, serverError } from '../../lib/http.js';
import { authenticateMember } from '../../lib/memberauth.js';

const EDITABLE = [
  'phone', 'email',
  'address_street', 'address_suburb', 'address_city', 'address_postal_code',
  'emergency_name', 'emergency_phone',
  'medical_aid_provider',
];

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'PATCH'])) return;
  const auth = authenticateMember(req, res);
  if (!auth) return;

  const supabase = getSupabase();

  try {
    if (req.method === 'PATCH') {
      const body = await readJsonBody(req);
      const patch = { updated_at: new Date().toISOString() };
      for (const k of EDITABLE) {
        if (body[k] !== undefined) patch[k] = (typeof body[k] === 'string' ? body[k].trim() : body[k]) || null;
      }
      const { error } = await supabase.from('members').update(patch).eq('id', auth.sub);
      if (error) return serverError(res, error.message);
      return ok(res, { updated: true, message: 'Your details have been updated.' });
    }

    const { data, error } = await supabase
      .from('members')
      .select(EDITABLE.join(', '))
      .eq('id', auth.sub)
      .maybeSingle();
    if (error) return serverError(res, error.message);
    return ok(res, { profile: data || {} });
  } catch (err) {
    console.error('member profile error:', err.message);
    return serverError(res, 'Could not update your details');
  }
}
