// POST /api/document  { membership_number, verification_code }
//   -> the data needed to render the membership PDF (card + confirmation).
//
// Lightweight auth: the caller must present BOTH the membership number and the
// matching verification code (the member has these from their success screen).
// No admin session required — this is the member downloading their own card.
//
// ⚠️ THIS ENDPOINT IS UNAUTHENTICATED AND ITS CREDENTIAL NEVER EXPIRES.
//
// It used to `select('*')`, which returned the whole members row: the member's
// national ID number and their biometric face templates, to anyone holding a
// permanent, reusable code, with no rate limit (D-123). The columns below are
// exactly what the PDF reads — verified against generateMembershipPdf.js and
// idcard.js — and nothing else. ADD A COLUMN HERE ONLY IF THE PDF NEEDS IT.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError } from '../../lib/http.js';
import { rateLimit } from '../../lib/ratelimit.js';

/**
 * The only member columns this endpoint may return.
 *
 * Exported so a test can assert that no identity or biometric column ever
 * creeps back in — the failure would be silent and permanent otherwise.
 */
export const PDF_MEMBER_COLUMNS = [
  'id',
  'membership_number',
  'verification_code',
  'full_name',
  'date_of_birth',
  'email',
  'phone',
  'address_street',
  'address_suburb',
  'address_city',
  'address_postal_code',
  'emergency_name',
  'emergency_phone',
  'experience_level',
  'fitness_goals',
  'injuries_notes',
  'medical_aid_provider',
  'created_at',
];

/** Columns that must NEVER be returned here, named so the intent is explicit. */
export const FORBIDDEN_MEMBER_COLUMNS = [
  'id_number',
  'passport_number',
  'face_descriptor',
  'arcface_embedding',
  'arcface_templates',
  'photo_url',
];

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;

  // Per-gym rate limiting (D-123). The code is 40 bits, so this is not really
  // about brute force — it is about making a probe visible instead of silent.
  if (!(await rateLimit(req, res, { key: 'document', limit: 10, windowMs: 60_000 }))) return;

  try {
    const { membership_number, verification_code } = await readJsonBody(req);
    if (!membership_number || !verification_code) {
      return badRequest(res, 'membership_number and verification_code are required.');
    }

    const supabase = getSupabase();

    const { data: member, error } = await supabase
      .from('members')
      .select(PDF_MEMBER_COLUMNS.join(', '))
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
