// What a gym's OWNER offers their members (CLAUDE.md §41 Q2).
//
// Three switches decide whether a member can use a service: the Yoyo plan, the
// platform's additions or removals for this gym (both resolved into
// currentGym().features), and — this file — the owner's own choice. The owner
// can only switch OFF what the first two allow; switching something on that
// the plan does not include is not theirs to do, and the plan check refuses it
// first anyway.
//
// Stored in the gym's own settings table, key `member_services`, as
// { off: [feature, …] }. No row means everything the plan allows is offered,
// which is how every gym behaved before this existed.
import { getSupabase } from './supabase.js';
import { currentGym } from './tenancy.js';
import { OWNER_SWITCHABLE, MEMBER_ROUTE_FEATURES } from '../../shared/features.js';

export const MEMBER_SERVICES_KEY = 'member_services';

/** Only the switchable services, from whatever was stored. */
export function readOff(value) {
  return Array.isArray(value?.off) ? OWNER_SWITCHABLE.filter((f) => value.off.includes(f)) : [];
}

// A member request should not cost a settings query every time: thirty
// seconds, the same window as the registry. Keyed by schema, so gyms never
// share an answer.
const TTL_MS = 30_000;
const cache = new Map();

const cacheKey = () => currentGym()?.schema || process.env.SUPABASE_SCHEMA || 'gym';

/** Forget this gym's answer — after the owner saves, on the same instance. */
export function forgetServicesOff() {
  cache.delete(cacheKey());
}

/** The services the owner has switched off for members. Fails OPEN to "none". */
export async function servicesOff(supabase) {
  const key = cacheKey();
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  let off = [];
  try {
    const db = supabase || getSupabase();
    const { data, error } = await db.from('settings').select('value').eq('key', MEMBER_SERVICES_KEY).maybeSingle();
    if (!error) off = readOff(data?.value);
  } catch {
    // A settings read that fails must not take a member's gym away from them.
  }
  cache.set(key, { value: off, expires: Date.now() + TTL_MS });
  return off;
}

/**
 * May a member reach this route, as far as the OWNER is concerned?
 * Called after the plan check, inside the gym's scope.
 */
export async function enforceMemberService(route, res, json, map = MEMBER_ROUTE_FEATURES, supabase) {
  const feature = map[route];
  if (!feature || !OWNER_SWITCHABLE.includes(feature)) return true;
  if (!(await servicesOff(supabase)).includes(feature)) return true;
  // 403, not 402: nobody can buy this — the gym has chosen not to offer it.
  json(res, 403, { error: 'Your gym does not offer this.', feature, offered: false });
  return false;
}
