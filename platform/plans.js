// Subscription plans, and the gating that enforces them.
//
// Authoritative definition: `CLAUDE.md` §18. This file is that section made
// executable, and the two must not drift.
//
// TWO PRINCIPLES
//
// 1. **Core gym operation is in every tier.** Registration, members, check-in,
//    payments, catalog, branding, staff, QR. A gym that cannot do those is not
//    running, and crippling them produces bad software rather than upgrades.
//    The market agrees: the leading competitor sells on including everything
//    and pricing by size.
//
// 2. **Gating lives in the ROUTERS.** One fixed key map per router — 42 admin
//    routes gated in one place. A permission check is never added to any of the
//    ~76 handlers, exactly as gym resolution was never added to them.
//
// Prices are NOT here. They are data in `platform_plans.price_cents`, set per
// deployment and changeable without a release.

// Feature keys and the route map live in shared/, because the gym app's routers
// enforce what this file defines and neither side may import the other (D-081).
// One definition, two readers.
export { FEATURES, featureForRoute } from '../shared/features.js';
import { FEATURES, featureForRoute, SERVICE_INFO } from '../shared/features.js';


const CORE = [
  FEATURES.MEMBERS,
  FEATURES.CHECKIN,
  FEATURES.PAYMENTS,
  FEATURES.CATALOG,
  FEATURES.SETTINGS,
  FEATURES.STAFF,
  FEATURES.QR,
];

const MEDIUM_ADDS = [
  FEATURES.CLASSES,
  FEATURES.TRAINERS,
  FEATURES.MESSAGING,
  FEATURES.REPORTING,
  FEATURES.PROGRESS,
  FEATURES.DATA_IO,
];

const PRIME_ADDS = [
  FEATURES.FACE,
  FEATURES.ACCESS_CONTROL,
  FEATURES.ADVANCED_ANALYTICS,
  FEATURES.MARKETING,
  FEATURES.REFERRALS,
  FEATURES.AUDIT,
];

/**
 * The three plans. Tiers NEST: each contains everything below it, which is what
 * makes "upgrade" a meaningful word and is asserted by a test.
 */
export const PLANS = [
  {
    key: 'basic',
    label: 'Basic',
    maxActiveMembers: 40,
    maxLocations: 1,
    // §41.1 Q4: Pause starts in every plan.
    features: [...CORE, FEATURES.FREEZE],
    summary: 'Everything needed to run a small gym.',
    memberBenefits: [
      'Join online in minutes, from their phone',
      'Get a membership card and QR code',
      'Check themselves in',
      'See their membership status and what they owe',
      'Keep their own contact details up to date',
    ],
  },
  {
    key: 'medium',
    label: 'Medium',
    maxActiveMembers: 150,
    maxLocations: 1,
    // §41.1 Q4: Medium adds Rewards, and Family and group.
    features: [...CORE, FEATURES.FREEZE, ...MEDIUM_ADDS, FEATURES.REWARDS, FEATURES.FAMILY],
    summary: 'For a growing gym running classes and personal training.',
    memberBenefits: [
      'Everything in Basic',
      'Book classes and join a waitlist',
      'Train with a trainer and see their workout notes',
      'Track their own progress over time',
      'Message the gym and get announcements',
    ],
  },
  {
    key: 'prime',
    label: 'Prime',
    maxActiveMembers: 500,
    maxLocations: 1,
    // §41.1 Q4: Prime adds Challenges.
    features: [...CORE, FEATURES.FREEZE, ...MEDIUM_ADDS, FEATURES.REWARDS, FEATURES.FAMILY, ...PRIME_ADDS, FEATURES.CHALLENGES],
    summary: 'The complete system, including face recognition at the door.',
    memberBenefits: [
      'Everything in Medium',
      'Walk in with face recognition — no card, no code',
      'Bring a guest, with visitor passes',
      'Refer friends and be credited for it',
    ],
  },
];

export const planByKey = (key) => PLANS.find((p) => p.key === key) ?? null;

export const hasFeature = (plan, feature) => Boolean(plan?.features?.includes(feature));


/** The cheapest plan that includes a feature — what an upgrade prompt names. */
function cheapestPlanWith(feature) {
  return PLANS.find((p) => p.features.includes(feature))?.key ?? null;
}

/**
 * May this plan reach this route?
 *
 * Returns 402 rather than 403 when blocked: this is a billing state, not a
 * permission error, and the difference decides what the screen should say.
 */
export function checkRoute(plan, route) {
  const feature = featureForRoute(route);

  if (!feature) {
    // Fail closed. An unmapped route is a mistake, not a free feature.
    return { allowed: false, status: 404, message: 'Not found.', requiredPlan: null };
  }

  if (hasFeature(plan, feature)) return { allowed: true };

  const requiredPlan = cheapestPlanWith(feature);
  const required = planByKey(requiredPlan);
  return {
    allowed: false,
    status: 402,
    feature,
    requiredPlan,
    message: `This is included in the ${required?.label ?? 'higher'} plan. Upgrade to use it.`,
  };
}

/**
 * May this gym register another member?
 *
 * A gym that DOWNGRADED below its member count keeps every existing member —
 * nothing is deleted or cut off, only new registrations stop.
 */
export function checkMemberLimit(plan, currentActiveMembers) {
  const limit = plan?.maxActiveMembers ?? 0;
  const count = Number(currentActiveMembers) || 0;

  if (count < limit) {
    return { allowed: true, remaining: limit - count, limit };
  }

  const index = PLANS.findIndex((p) => p.key === plan.key);
  const next = PLANS[index + 1] ?? null;

  return {
    allowed: false,
    status: 402,
    limit,
    current: count,
    overLimitBy: count > limit ? count - limit : 0,
    // Stated explicitly because it is the thing an anxious gym owner asks first.
    existingMembersAffected: false,
    suggestedPlan: next?.key ?? null,
    message: next
      ? `This plan covers ${limit} active members. Upgrade to ${next.label} for ${next.maxActiveMembers}.`
      : `This plan covers ${limit} active members. Contact us about more.`,
  };
}

/**
 * The plan as a gym OWNER should see it while choosing.
 *
 * Deliberately leads with what their MEMBERS can do, because that is what an
 * owner is actually buying — not a list of admin screens.
 */
/**
 * A plan, as a GYM OWNER reads it — from the LIVE plan settings when given a
 * row from platform_plans, so the registration page shows the services and
 * the price the main admin actually set (CLAUDE.md §41), not a list written
 * here. Given one of the PLANS above (no price, no row), it describes the
 * defaults, and the price stays null: prices are data, never code.
 *
 * @param {object} plan  a platform_plans row, or one of PLANS
 * @param {object[]} [all] every plan in order, to say what the next one adds
 */
export function ownerFacingPlan(plan, all = null) {
  const known = planByKey(plan.key);
  const features = Array.isArray(plan.features) ? plan.features : known?.features || [];
  const ordered = Array.isArray(all) && all.length ? all : PLANS;
  const index = ordered.findIndex((p) => p.key === plan.key);
  const next = index >= 0 ? ordered[index + 1] ?? null : null;
  const nextFeatures = next ? (Array.isArray(next.features) ? next.features : planByKey(next.key)?.features || []) : [];
  const max = plan.max_active_members ?? plan.maxActiveMembers ?? null;
  const label = (f) => SERVICE_INFO[f]?.label;

  return {
    key: plan.key,
    label: plan.label || known?.label || plan.key,
    summary: plan.summary || known?.summary || '',
    memberLimit: max ? `Up to ${max} active members` : 'No member limit',
    locations: plan.maxLocations ?? known?.maxLocations ?? 1,
    included: features.map(label).filter(Boolean),
    memberBenefits: features.map((f) => SERVICE_INFO[f]?.forMembers).filter(Boolean),
    nextPlanAdds: nextFeatures.filter((f) => !features.includes(f)).map(label).filter(Boolean),
    support: supportFor(plan),
    trialDays: trialDaysOf(plan),
    // Only a price someone SET, from platform_plans. Never a number written here.
    price: Number.isInteger(plan.price_cents) && plan.price_cents > 0 ? plan.price_cents : null,
    currency: plan.currency || 'ZAR',
  };
}

/**
 * What a PERSON at Yoyo Gyms delivers, switched on or off per plan on the
 * Plans page (CLAUDE.md §47.1 Q4) — the software's own services are switched
 * in `features`. Stored in platform_plans.promises; a plan without that
 * column yet keeps the defaults below, which are what §41.1 Q6 promised.
 */
export const PLAN_PROMISES = [
  ['setup_help', 'Setup help for your first week'],
  ['member_import_help', 'Help moving your existing members across'],
  ['email_support', 'Email support'],
  ['same_day_replies', 'Email support with same-business-day replies'],
  ['whatsapp_line', 'A WhatsApp support line'],
  ['account_manager', 'A named account manager who checks in monthly'],
];
const PROMISE_KEYS = PLAN_PROMISES.map(([k]) => k);
const PROMISE_LABEL = Object.fromEntries(PLAN_PROMISES);

export const DEFAULT_PROMISES = {
  basic: ['setup_help', 'member_import_help', 'email_support'],
  medium: ['setup_help', 'member_import_help', 'email_support', 'same_day_replies'],
  prime: ['setup_help', 'member_import_help', 'email_support', 'same_day_replies', 'whatsapp_line', 'account_manager'],
};

/** Days free before a new gym's first charge, unless its plan says otherwise. */
export const DEFAULT_TRIAL_DAYS = 30;

/** The plan's switched-on promises, as keys, in their fixed order. */
export function promisesOf(plan) {
  const list = Array.isArray(plan?.promises) ? plan.promises : DEFAULT_PROMISES[plan?.key] || DEFAULT_PROMISES.basic;
  return PROMISE_KEYS.filter((k) => list.includes(k));
}

/** The plan's free trial, in days: its own number, or the default. */
export function trialDaysOf(plan) {
  const n = Number(plan?.trial_days);
  return plan?.trial_days !== null && plan?.trial_days !== undefined && Number.isInteger(n) && n >= 0 ? n : DEFAULT_TRIAL_DAYS;
}

/**
 * The promises as an owner reads them. Same-day replies ARE email support, so
 * the two read as one line.
 */
export function supportFor(plan) {
  const keys = promisesOf(plan);
  return keys.filter((k) => !(k === 'email_support' && keys.includes('same_day_replies'))).map((k) => PROMISE_LABEL[k]);
}

/** The defaults, as lines — for anywhere that has no live plan to hand. */
export const SUPPORT_BY_PLAN = Object.fromEntries(Object.keys(DEFAULT_PROMISES).map((k) => [k, supportFor({ key: k })]));

/**
 * True of every plan, in the software itself (§41.1 Q6) — facts no switch
 * could turn off. What a person delivers, and the free trial, are per plan.
 */
export const EVERY_PLAN_INCLUDES = [
  ['Verified listing', 'Every gym is checked by a person before members can find it, so yours stands next to real gyms only.'],
  ['Your own branded app', 'Members see your name, logo, colours, cover and poster, in the app and on the web.'],
  ['Your data, kept apart', "Each gym's members live in their own separate area of the database. No other gym can reach them."],
  ["Your members' privacy", "Yoyo staff see counts only, never your members' names, phone numbers or health answers."],
  ['QR posters, ready to print', 'Join, sign-in and check-in codes for your walls and front desk.'],
  ['A signed agreement', 'Your Gym Owner Agreement and Owner ID as a PDF, for your records.'],
];

/**
 * The plans as a gym owner chooses them, from the LIVE settings (§41): only
 * those offered to new gyms, in order, each described by ownerFacingPlan. If
 * the plans cannot be read, the defaults in the code — without prices, which
 * is honest — rather than an empty page.
 */
export async function livePlansForOwners(deps) {
  let rows = [];
  try {
    rows = ((await deps.listPlans?.()) || []).filter((p) => p.is_enabled !== false && planByKey(p.key));
  } catch {
    rows = [];
  }
  const source = rows.length ? PLANS.map((d) => rows.find((r) => r.key === d.key)).filter(Boolean) : PLANS;
  return source.map((p) => ownerFacingPlan(p, source));
}
