// POST /api/members/document  { membership_number, verification_code }
//   -> full data needed to render the membership PDF (card + confirmation).
//
// Lightweight auth: the caller must present BOTH the membership number and the
// matching verification code (the member has these from their success screen).
// No admin session required — this is the member downloading their own card.
import { getSupabase } from '../_lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError } from '../_lib/http.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  try {
    const { membership_number, verification_code } = await readJsonBody(req);
    if (!membership_number || !verification_code) {
      return badRequest(res, 'membership_number and verification_code are required.');
    }

    const supabase = getSupabase();

    const { data: member, error } = await supabase
      .from('members')
      .select('*')
      .eq('membership_number', membership_number)
      .eq('verification_code', verification_code)
      .maybeSingle();
    if (error) return serverError(res, error.message);
    if (!member) return badRequest(res, 'Membership not found or code does not match.');

    const [{ data: membership }, { data: parq }, { data: addons }, { data: settingRows }] =
      await Promise.all([
        supabase
          .from('memberships')
          .select('*, plans(name)')
          .eq('member_id', member.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from('parq_responses').select('*').eq('member_id', member.id).maybeSingle(),
        supabase
          .from('member_addons')
          .select('price_at_purchase, billing_type, addon_services(name)')
          .eq('member_id', member.id),
        supabase.from('settings').select('key, value').in('key', ['gym_profile']),
      ]);

    const gymProfile = (settingRows || []).find((r) => r.key === 'gym_profile')?.value || {};

    return ok(res, {
      gym: {
        name: gymProfile.name || 'Your Gym',
        accent: gymProfile.accent_color || '#E63946',
        phone: gymProfile.phone || '',
        address: gymProfile.address || '',
        email: gymProfile.email || '',
      },
      member,
      membership: membership || null,
      parq: parq || null,
      addons: (addons || []).map((a) => ({
        name: a.addon_services?.name,
        price: Number(a.price_at_purchase || 0),
        billing_type: a.billing_type,
      })),
    });
  } catch (err) {
    console.error('document error:', err.message);
    return serverError(res, 'Could not load membership document');
  }
}
