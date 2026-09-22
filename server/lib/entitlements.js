// Plan entitlements — the gate in front of the gym app's routes.
//
// THE RULE THAT MATTERS MOST
//
// Every existing gym deployment runs with no platform, no plan and no resolved
// gym. **Gating is completely inert there.** A single-gym deployment behaves
// exactly as it did before this file existed. Breaking working systems to
// enforce a plan nobody has bought would be a bad trade.
//
// So there are two states, and only two:
//
//   NO RESOLVED GYM   → single-gym deployment. Everything is allowed.
//   RESOLVED GYM      → platform. Only what the plan includes is allowed, and a
//                       gym with no features list gets NOTHING (fails closed).
//
// The second half of that is deliberate: a resolved gym whose features are
// missing must not be mistaken for a single-gym deployment, or a Basic gym
// would silently receive the entire system.
//
// Enforcement sits in the ROUTERS, not in the ~76 handlers — one fixed key map
// per router, so 42 admin routes are gated in one place and no handler changed.
import { featureForRoute } from '../../shared/features.js';
import { currentGym } from './tenancy.js';

/**
 * May this request reach this route?
 *
 * @param {string} route  the router key, e.g. 'classes'
 * @returns {{allowed: boolean, status?: number, message?: string, feature?: string}}
 */
export function entitlementFor(route) {
  const resolved = currentGym();

  // Single-gym deployment: no platform involved, nothing to enforce.
  if (!resolved) return { allowed: true };

  const feature = featureForRoute(route);
  if (!feature) {
    // Unknown route: not found, not a billing prompt. Fails closed.
    return { allowed: false, status: 404, message: 'Not found.' };
  }

  // A resolved gym with no features list gets nothing. Absence of a plan is
  // not permission.
  const features = Array.isArray(resolved.features) ? resolved.features : [];

  if (features.includes(feature)) return { allowed: true };

  return {
    allowed: false,
    status: 402, // Payment Required — a billing state, not a permission error
    feature,
    message: 'This feature is not included in your plan. Upgrade to use it.',
  };
}

/**
 * May this gym register another member?
 *
 * A gym that DOWNGRADED below its member count keeps every existing member.
 * Nothing is deleted and nobody is cut off; only new registrations stop.
 *
 * @param {number} activeMembers  how many the gym has now
 * @param {object} [plan]         { maxActiveMembers }
 */
export function allowsMemberRegistration(activeMembers, plan = null) {
  const resolved = currentGym();

  // Single-gym deployment: never limited.
  if (!resolved) return { allowed: true };

  const limit = plan?.maxActiveMembers ?? resolved.plan?.maxActiveMembers ?? null;

  // No stated limit means unlimited, NOT zero. Defaulting to zero would lock a
  // gym out of its own system over a missing field.
  if (limit === null || limit === undefined) return { allowed: true };

  const count = Number(activeMembers) || 0;
  if (count < limit) return { allowed: true, remaining: limit - count };

  return {
    allowed: false,
    status: 402,
    limit,
    current: count,
    existingMembersAffected: false,
    message: `Your plan covers ${limit} active members. Upgrade to add more.`,
  };
}

/**
 * Router helper: enforce and respond in one step.
 * Returns true when the request may proceed.
 */
export function enforceEntitlement(route, res, json) {
  const check = entitlementFor(route);
  if (check.allowed) return true;
  json(res, check.status, { error: check.message, feature: check.feature ?? null });
  return false;
}
