// A gym's free facilities, as its owner lists them (CLAUDE.md §41.1 Q8).
//
// Shared by the owner's Settings screen (tick them), the server (accept only
// these keys plus a few short words of the owner's own) and the members' gym
// page (show them). Stored in the gym's settings table, key `facilities`, as
// { items: [key, …], custom: ['Boxing ring', …] }.

export const FACILITIES_KEY = 'facilities';

export const FACILITIES = [
  ['showers', 'Showers'],
  ['changing_rooms', 'Changing rooms'],
  ['lockers', 'Lockers'],
  ['towels', 'Towels'],
  ['parking', 'Parking'],
  ['wifi', 'Free Wi-Fi'],
  ['water', 'Drinking water'],
  ['air_con', 'Air conditioning'],
  ['sauna', 'Sauna'],
  ['steam_room', 'Steam room'],
  ['pool', 'Swimming pool'],
  ['cafe', 'Café or smoothie bar'],
  ['childcare', 'Childcare'],
  ['wheelchair', 'Wheelchair access'],
  ['open_24h', 'Open 24 hours'],
  ['women_only_area', 'Women-only area'],
];

export const MAX_CUSTOM_FACILITIES = 12;
export const MAX_CUSTOM_LENGTH = 40;

const labelOf = new Map(FACILITIES);

/**
 * Clean what an owner sent. Unknown keys are dropped; the owner's own words
 * are trimmed, kept short and de-duplicated. Returns the value to store.
 */
export function cleanFacilities(value) {
  const items = Array.isArray(value?.items) ? FACILITIES.map(([k]) => k).filter((k) => value.items.includes(k)) : [];
  const seen = new Set();
  const custom = [];
  for (const raw of Array.isArray(value?.custom) ? value.custom : []) {
    const text = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_CUSTOM_LENGTH);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    custom.push(text);
    if (custom.length >= MAX_CUSTOM_FACILITIES) break;
  }
  return { items, custom };
}

/** What a member reads: the ticked facilities, then the owner's own. */
export function facilityLabels(value) {
  const { items, custom } = cleanFacilities(value);
  return [...items.map((k) => labelOf.get(k)), ...custom];
}
