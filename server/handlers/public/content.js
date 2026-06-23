// GET /api/content -> public legal/branding text for the registration flow.
// Pulls editable text from gym.settings (managed in the admin panel, Phase 7)
// and falls back to compliant defaults so the flow works before configuration.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, ok, serverError } from '../../lib/http.js';

const DEFAULTS = {
  gym_name: 'Your Gym',
  indemnity_text:
    'I acknowledge that physical exercise carries inherent risks including injury or illness. ' +
    'I confirm that I am physically capable of participating in a gym environment. ' +
    'I indemnify the gym and its staff against any injury, illness, loss, or damage arising from ' +
    'my use of the facilities, to the extent permitted by South African law.',
  contract_text:
    'MEMBERSHIP CONTRACT & TERMS\n\n' +
    '1. Billing: Monthly fees are collected by debit order / card on the agreed billing date.\n' +
    '2. Cancellation: Members may cancel with 20 business days written notice (CPA compliant).\n' +
    '3. Early cancellation of a fixed-term contract may attract a cancellation fee as set out at sign-up.\n' +
    '4. Members agree to follow the gym rules and code of conduct at all times.\n' +
    '5. Guests are subject to the gym guest policy.\n' +
    '6. In a medical emergency, the gym may obtain emergency assistance on the member’s behalf.\n' +
    '7. Personal information is processed in line with POPIA (see privacy policy).',
  popia_text:
    'PRIVACY POLICY (POPIA)\n\n' +
    'We process your personal information solely to administer your membership, payments, ' +
    'health & safety screening, and communications. Your data is stored securely and is not sold. ' +
    'You may request access to, correction of, or deletion of your personal information at any time. ' +
    '(Protection of Personal Information Act, Act 4 of 2013.)',
  contract_terms_version: 'v1',
};

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', ['gym_profile', 'indemnity_text', 'contract_text', 'popia_text', 'contract_terms_version']);

    if (error) return serverError(res, error.message);

    const map = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
    const gymName = map.gym_profile?.name || DEFAULTS.gym_name;

    return ok(res, {
      gym_name: gymName,
      indemnity_text: (map.indemnity_text?.text || DEFAULTS.indemnity_text).replaceAll(
        '[GYM NAME]',
        gymName
      ),
      contract_text: map.contract_text?.text || DEFAULTS.contract_text,
      popia_text: map.popia_text?.text || DEFAULTS.popia_text,
      contract_terms_version: map.contract_terms_version?.value || DEFAULTS.contract_terms_version,
    });
  } catch (err) {
    console.error('content error:', err.message);
    return serverError(res, 'Could not load content');
  }
}
