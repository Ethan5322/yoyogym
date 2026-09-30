// GET /api/content -> public legal/branding text for the registration flow.
// Pulls editable text from gym.settings (managed in the admin panel, Phase 7)
// and falls back to compliant defaults so the flow works before configuration.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, ok, serverError, failed } from '../../lib/http.js';
import { currentGym } from '../../lib/tenancy.js';
import { readOff, MEMBER_SERVICES_KEY } from '../../lib/member-services.js';
import { FACILITIES_KEY, facilityLabels } from '../../../shared/facilities.js';
import { SERVICE_INFO, ALL_SERVICES } from '../../../shared/features.js';
import { homeCountryFor, currencyForCountry, dialForCountry } from '../../../shared/countries.js';

/**
 * The services a member of this gym can use, in words. `features` is null in
 * a standalone deployment (no plan, everything available), as elsewhere.
 */
export function offeredServices(features, off = []) {
  const available = Array.isArray(features) ? features : ALL_SERVICES;
  return ALL_SERVICES.filter((f) => available.includes(f) && !off.includes(f) && SERVICE_INFO[f]?.forMembers).map((f) => ({
    key: f,
    text: SERVICE_INFO[f].forMembers,
  }));
}

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
      .in('key', ['gym_profile', 'indemnity_text', 'contract_text', 'popia_text', 'contract_terms_version', FACILITIES_KEY, MEMBER_SERVICES_KEY]);

    if (error) return failed(res, error);

    const map = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
    const profile = map.gym_profile || {};
    // The gym's own saved name; else its name in the Yoyo registry; else a
    // neutral default — never another gym's, or the old single-gym name.
    const gymName = profile.name || currentGym()?.gym?.search_name || DEFAULTS.gym_name;
    // Where the gym is, so the app shows ITS money and phone format — an
    // Ethiopian gym's prices are not in Rand (critique 2026-09-29). The gym's
    // own profile first, then the registry, then the default home country.
    const country = homeCountryFor(profile.country || currentGym()?.gym?.country);

    return ok(res, {
      gym_name: gymName,
      // Branding (consumed by the splash screen + runtime theme — no per-gym code).
      branding: {
        name: gymName,
        tagline: profile.tagline || 'Train harder. Live stronger.',
        accent_color: profile.accent_color || null,
        logo_url: profile.logo_url || null,
        welcome_message: profile.welcome_message || null,
        // The gym's home in the app (CLAUDE.md §38.1 Q4): what the owner chose
        // to show its members. All of it is what a gym shows the public.
        cover_url: profile.cover_url || null,
        // The tall background poster behind the gym's member screens (§39.1 Q3).
        poster_url: profile.poster_url || null,
        notice: profile.notice || null,
        operating_hours: profile.operating_hours || null,
        phone: profile.phone || null,
        email: profile.email || null,
        address: profile.address || null,
        country,
        currency: currencyForCountry(country),
        dial: dialForCountry(country) || null,
      },
      indemnity_text: (map.indemnity_text?.text || DEFAULTS.indemnity_text).replaceAll(
        '[GYM NAME]',
        gymName
      ),
      contract_text: map.contract_text?.text || DEFAULTS.contract_text,
      popia_text: map.popia_text?.text || DEFAULTS.popia_text,
      contract_terms_version: map.contract_terms_version?.value || DEFAULTS.contract_terms_version,
      // WHAT THIS GYM OFFERS ITS MEMBERS (CLAUDE.md §41): the services its plan
      // allows and its owner has not switched off, and the facilities the
      // owner listed. Its membership plans and add-ons, with prices, come from
      // /api/catalog, as they always have.
      offer: {
        services: offeredServices(currentGym()?.features, readOff(map[MEMBER_SERVICES_KEY])),
        facilities: facilityLabels(map[FACILITIES_KEY]),
      },
    });
  } catch (err) {
    console.error('content error:', err.message);
    return serverError(res, 'Could not load content');
  }
}
