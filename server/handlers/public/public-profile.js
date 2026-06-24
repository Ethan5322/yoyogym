// GET /api/public-profile?type=member&key=<membership_number>
//                         ?type=trainer&id=<uuid>
// Public "is this a valid Yoyo GYM person?" profile (QR Type B). NO auth.
// Returns ONLY non-sensitive fields: name, photo, role, status badge.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, ok, badRequest, serverError } from '../../lib/http.js';

const VALID = new Set(['active', 'expiring']);

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;
  const url = new URL(req.url, 'http://localhost');
  const type = url.searchParams.get('type') || 'member';
  const supabase = getSupabase();

  try {
    if (type === 'trainer') {
      const id = url.searchParams.get('id') || url.searchParams.get('key');
      if (!id) return badRequest(res, 'id is required.');
      const { data: t } = await supabase
        .from('trainers')
        .select('full_name, photo_url, specialization, is_active')
        .eq('id', id)
        .maybeSingle();
      if (!t) return ok(res, { found: false });
      return ok(res, {
        found: true,
        name: t.full_name,
        photo_url: t.photo_url,
        role: 'Trainer',
        subrole: t.specialization || null,
        valid: !!t.is_active,
        status_label: t.is_active ? 'Active Trainer' : 'Inactive',
      });
    }

    // member
    const key = url.searchParams.get('key');
    if (!key) return badRequest(res, 'key is required.');
    const { data: m } = await supabase
      .from('members')
      .select('id, full_name, photo_url, status')
      .eq('membership_number', key.trim().toUpperCase())
      .maybeSingle();
    if (!m) return ok(res, { found: false });

    const { data: membership } = await supabase
      .from('memberships')
      .select('tier, plans(name)')
      .eq('member_id', m.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return ok(res, {
      found: true,
      name: m.full_name,
      photo_url: m.photo_url,
      role: 'Member',
      subrole: membership?.plans?.name || (membership?.tier ? membership.tier.toUpperCase() : null),
      valid: VALID.has(m.status),
      status_label: VALID.has(m.status) ? 'Valid Yoyo GYM Member' : 'Membership not active',
    });
  } catch (err) {
    console.error('public-profile error:', err.message);
    return serverError(res, 'Could not load profile');
  }
}
