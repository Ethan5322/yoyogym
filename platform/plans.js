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

/**
 * Feature keys. A route maps to one of these; a plan holds a list of them.
 * Keeping them coarse is deliberate — a gym owner should be able to read the
 * plan table and know what they are buying.
 */
export const FEATURES = {
  // Core — in every tier
  MEMBERS: 'members',
  CHECKIN: 'checkin',
  PAYMENTS: 'payments',
  CATALOG: 'catalog',
  SETTINGS: 'settings',
  STAFF: 'staff',
  QR: 'qr',
  // Medium
  CLASSES: 'classes',
  TRAINERS: 'trainers',
  MESSAGING: 'messaging',
  REPORTING: 'reporting',
  PROGRESS: 'progress',
  DATA_IO: 'data_io',
  // Prime
  FACE: 'face',
  ACCESS_CONTROL: 'access_control',
  ADVANCED_ANALYTICS: 'advanced_analytics',
  MARKETING: 'marketing',
  REFERRALS: 'referrals',
  AUDIT: 'audit',
};

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
    features: [...CORE],
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
    features: [...CORE, ...MEDIUM_ADDS],
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
    features: [...CORE, ...MEDIUM_ADDS, ...PRIME_ADDS],
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

/**
 * Route → feature. Every admin route appears here.
 *
 * An unmapped route is REFUSED, not allowed: a new route added without a
 * mapping must fail closed rather than become silently available to every tier.
 */
const ROUTE_FEATURES = {
  // Core
  dashboard: FEATURES.MEMBERS,
  members: FEATURES.MEMBERS,
  member: FEATURES.MEMBERS,
  'member-action': FEATURES.MEMBERS,
  verify: FEATURES.CHECKIN,
  today: FEATURES.CHECKIN,
  'resolve-member': FEATURES.CHECKIN,
  payments: FEATURES.PAYMENTS,
  finance: FEATURES.PAYMENTS,
  plans: FEATURES.CATALOG,
  addons: FEATURES.CATALOG,
  settings: FEATURES.SETTINGS,
  staff: FEATURES.STAFF,
  profile: FEATURES.STAFF,
  'qr-stats': FEATURES.QR,

  // Medium
  classes: FEATURES.CLASSES,
  'class-bookings': FEATURES.CLASSES,
  events: FEATURES.CLASSES,
  trainers: FEATURES.TRAINERS,
  clients: FEATURES.TRAINERS,
  'training-session': FEATURES.TRAINERS,
  inbox: FEATURES.MESSAGING,
  message: FEATURES.MESSAGING,
  announcements: FEATURES.MESSAGING,
  notifications: FEATURES.MESSAGING,
  'attendance-live': FEATURES.REPORTING,
  progress: FEATURES.PROGRESS,
  'members-import': FEATURES.DATA_IO,

  // Prime
  'face-descriptors': FEATURES.FACE,
  'enroll-face': FEATURES.FACE,
  'access-card': FEATURES.ACCESS_CONTROL,
  'access-action': FEATURES.ACCESS_CONTROL,
  visitor: FEATURES.ACCESS_CONTROL,
  incident: FEATURES.ACCESS_CONTROL,
  analytics: FEATURES.ADVANCED_ANALYTICS,
  'attendance-report': FEATURES.ADVANCED_ANALYTICS,
  broadcast: FEATURES.MARKETING,
  referrals: FEATURES.REFERRALS,
  audit: FEATURES.AUDIT,
};

export const featureForRoute = (route) => ROUTE_FEATURES[route] ?? null;

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
export function ownerFacingPlan(plan) {
  const index = PLANS.findIndex((p) => p.key === plan.key);
  const next = PLANS[index + 1] ?? null;

  const labelFor = {
    [FEATURES.MEMBERS]: 'Member registration and records',
    [FEATURES.CHECKIN]: 'Check-in and door verification',
    [FEATURES.PAYMENTS]: 'Payment records, receipts and arrears',
    [FEATURES.CATALOG]: 'Your own membership plans and add-ons',
    [FEATURES.SETTINGS]: 'Your gym name, logo and colours',
    [FEATURES.STAFF]: 'Staff accounts and roles',
    [FEATURES.QR]: 'QR codes for your gym and members',
    [FEATURES.CLASSES]: 'Classes, bookings and waitlists',
    [FEATURES.TRAINERS]: 'Trainers and personal training',
    [FEATURES.MESSAGING]: 'Announcements and member messaging',
    [FEATURES.REPORTING]: 'Attendance and revenue reporting',
    [FEATURES.PROGRESS]: 'Member progress tracking',
    [FEATURES.DATA_IO]: 'Import and export your data',
    [FEATURES.FACE]: 'Face recognition sign-in and door scanner',
    [FEATURES.ACCESS_CONTROL]: 'Visitor passes and incident logging',
    [FEATURES.ADVANCED_ANALYTICS]: 'Churn, retention, peak hours, board report',
    [FEATURES.MARKETING]: 'Bulk email to your members',
    [FEATURES.REFERRALS]: 'Member referral programme',
    [FEATURES.AUDIT]: 'Full audit log of staff actions',
  };

  return {
    key: plan.key,
    label: plan.label,
    summary: plan.summary,
    memberLimit: `Up to ${plan.maxActiveMembers} active members`,
    locations: plan.maxLocations,
    included: plan.features.map((f) => labelFor[f]).filter(Boolean),
    memberBenefits: plan.memberBenefits,
    nextPlanAdds: next
      ? next.features.filter((f) => !plan.features.includes(f)).map((f) => labelFor[f]).filter(Boolean)
      : [],
    // Never hard-coded. Read from platform_plans at runtime.
    price: null,
  };
}
