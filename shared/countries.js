// Country reference data — the single source of truth shared by the frontend
// (registration country pickers, phone/address adaptation, price conversion)
// and the serverless /api/register function (derive the member's local
// currency for display). Pure data: no DOM, no Node APIs.
//
// Each entry: { code (ISO-3166 alpha-2), name, dial (calling code, no +),
//               currency (ISO-4217), flag (emoji) }.
//
// The list leads with the home market (South Africa) and the rest of Africa —
// MuleSoo's primary reach — then major global economies. It doesn't need to be
// exhaustive; unknown currencies simply fall back to a ZAR-only price display.

export const COUNTRIES = [
  { code: 'ZA', name: 'South Africa', dial: '27', currency: 'ZAR', flag: '🇿🇦' },
  { code: 'ET', name: 'Ethiopia', dial: '251', currency: 'ETB', flag: '🇪🇹' },
  { code: 'NG', name: 'Nigeria', dial: '234', currency: 'NGN', flag: '🇳🇬' },
  { code: 'KE', name: 'Kenya', dial: '254', currency: 'KES', flag: '🇰🇪' },
  { code: 'GH', name: 'Ghana', dial: '233', currency: 'GHS', flag: '🇬🇭' },
  { code: 'TZ', name: 'Tanzania', dial: '255', currency: 'TZS', flag: '🇹🇿' },
  { code: 'UG', name: 'Uganda', dial: '256', currency: 'UGX', flag: '🇺🇬' },
  { code: 'RW', name: 'Rwanda', dial: '250', currency: 'RWF', flag: '🇷🇼' },
  { code: 'ZW', name: 'Zimbabwe', dial: '263', currency: 'USD', flag: '🇿🇼' },
  { code: 'ZM', name: 'Zambia', dial: '260', currency: 'ZMW', flag: '🇿🇲' },
  { code: 'BW', name: 'Botswana', dial: '267', currency: 'BWP', flag: '🇧🇼' },
  { code: 'NA', name: 'Namibia', dial: '264', currency: 'NAD', flag: '🇳🇦' },
  { code: 'MZ', name: 'Mozambique', dial: '258', currency: 'MZN', flag: '🇲🇿' },
  { code: 'MW', name: 'Malawi', dial: '265', currency: 'MWK', flag: '🇲🇼' },
  { code: 'LS', name: 'Lesotho', dial: '266', currency: 'LSL', flag: '🇱🇸' },
  { code: 'SZ', name: 'Eswatini', dial: '268', currency: 'SZL', flag: '🇸🇿' },
  { code: 'AO', name: 'Angola', dial: '244', currency: 'AOA', flag: '🇦🇴' },
  { code: 'CD', name: 'DR Congo', dial: '243', currency: 'CDF', flag: '🇨🇩' },
  { code: 'CM', name: 'Cameroon', dial: '237', currency: 'XAF', flag: '🇨🇲' },
  { code: 'CI', name: "Côte d'Ivoire", dial: '225', currency: 'XOF', flag: '🇨🇮' },
  { code: 'SN', name: 'Senegal', dial: '221', currency: 'XOF', flag: '🇸🇳' },
  { code: 'EG', name: 'Egypt', dial: '20', currency: 'EGP', flag: '🇪🇬' },
  { code: 'MA', name: 'Morocco', dial: '212', currency: 'MAD', flag: '🇲🇦' },
  { code: 'DZ', name: 'Algeria', dial: '213', currency: 'DZD', flag: '🇩🇿' },
  { code: 'TN', name: 'Tunisia', dial: '216', currency: 'TND', flag: '🇹🇳' },
  { code: 'SD', name: 'Sudan', dial: '249', currency: 'SDG', flag: '🇸🇩' },
  { code: 'SO', name: 'Somalia', dial: '252', currency: 'SOS', flag: '🇸🇴' },
  { code: 'MG', name: 'Madagascar', dial: '261', currency: 'MGA', flag: '🇲🇬' },
  { code: 'MU', name: 'Mauritius', dial: '230', currency: 'MUR', flag: '🇲🇺' },
  { code: 'US', name: 'United States', dial: '1', currency: 'USD', flag: '🇺🇸' },
  { code: 'GB', name: 'United Kingdom', dial: '44', currency: 'GBP', flag: '🇬🇧' },
  { code: 'CA', name: 'Canada', dial: '1', currency: 'CAD', flag: '🇨🇦' },
  { code: 'AU', name: 'Australia', dial: '61', currency: 'AUD', flag: '🇦🇺' },
  { code: 'DE', name: 'Germany', dial: '49', currency: 'EUR', flag: '🇩🇪' },
  { code: 'FR', name: 'France', dial: '33', currency: 'EUR', flag: '🇫🇷' },
  { code: 'NL', name: 'Netherlands', dial: '31', currency: 'EUR', flag: '🇳🇱' },
  { code: 'IE', name: 'Ireland', dial: '353', currency: 'EUR', flag: '🇮🇪' },
  { code: 'IT', name: 'Italy', dial: '39', currency: 'EUR', flag: '🇮🇹' },
  { code: 'ES', name: 'Spain', dial: '34', currency: 'EUR', flag: '🇪🇸' },
  { code: 'PT', name: 'Portugal', dial: '351', currency: 'EUR', flag: '🇵🇹' },
  { code: 'CH', name: 'Switzerland', dial: '41', currency: 'CHF', flag: '🇨🇭' },
  { code: 'SE', name: 'Sweden', dial: '46', currency: 'SEK', flag: '🇸🇪' },
  { code: 'AE', name: 'United Arab Emirates', dial: '971', currency: 'AED', flag: '🇦🇪' },
  { code: 'SA', name: 'Saudi Arabia', dial: '966', currency: 'SAR', flag: '🇸🇦' },
  { code: 'QA', name: 'Qatar', dial: '974', currency: 'QAR', flag: '🇶🇦' },
  { code: 'TR', name: 'Türkiye', dial: '90', currency: 'TRY', flag: '🇹🇷' },
  { code: 'IN', name: 'India', dial: '91', currency: 'INR', flag: '🇮🇳' },
  { code: 'PK', name: 'Pakistan', dial: '92', currency: 'PKR', flag: '🇵🇰' },
  { code: 'CN', name: 'China', dial: '86', currency: 'CNY', flag: '🇨🇳' },
  { code: 'BR', name: 'Brazil', dial: '55', currency: 'BRL', flag: '🇧🇷' },
];

const BY_CODE = Object.fromEntries(COUNTRIES.map((c) => [c.code, c]));

/** Look up a country by ISO code (case-insensitive). Returns undefined if unknown. */
export function countryByCode(code) {
  return code ? BY_CODE[String(code).toUpperCase()] : undefined;
}

/** ISO-4217 currency for a country code, or 'ZAR' when unknown. */
export function currencyForCountry(code) {
  return countryByCode(code)?.currency || 'ZAR';
}

/** Calling code (no '+') for a country code, or '' when unknown. */
export function dialForCountry(code) {
  return countryByCode(code)?.dial || '';
}

/**
 * The DEFAULT home country, used when a gym has not said where it is.
 *
 * It is 'ZA' because that is where the first gym is, and changing the default
 * would silently change how that gym's existing registration behaves. It is
 * NOT a statement that the platform is South African — see homeCountryFor().
 */
export const HOME_COUNTRY = 'ZA';

/**
 * A gym's home country, from its own profile.
 *
 * Yoyo Gyms is worldwide (D-125). "Local" is a property of the GYM, not of the
 * software: a gym in Addis Ababa asks Ethiopians for their national ID and
 * everyone else for a passport, exactly as a gym in Cape Town asks South
 * Africans for an SA ID.
 *
 * Falls back to HOME_COUNTRY for a gym that has not recorded a country, so the
 * existing single-gym deployment behaves exactly as it always has.
 */
export function homeCountryFor(code) {
  const value = String(code || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(value)) return HOME_COUNTRY;
  // An unknown-but-well-formed code is honoured rather than discarded: the
  // 50-country list is a convenience, not a statement about which countries
  // are allowed to have gyms.
  return value;
}

/**
 * What to call the local identity document, and how hard to check it.
 *
 * Only South Africa gets a format check, because the SA ID number is the only
 * one this codebase knows how to validate. Everywhere else the number is
 * recorded as given — a loose check that accepts a real document beats a
 * strict one that rejects it.
 */
export function nationalIdRuleFor(code) {
  const home = homeCountryFor(code);
  if (home === 'ZA') {
    return { label: 'South African ID number', hint: '13 digits', strict: true, country: home };
  }
  const name = countryByCode(home)?.name || home;
  return { label: `${name} national ID number`, hint: '', strict: false, country: home };
}
