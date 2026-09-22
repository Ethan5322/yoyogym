// Feature keys and the route → feature map.
//
// This lives in `shared/` because BOTH sides need it and neither may import the
// other (D-081): the platform defines which plan includes which feature, and the
// gym app's routers enforce it. One definition, two readers — duplicating it
// would guarantee the two drift.
//
// Keys are deliberately coarse. A gym owner should be able to read the plan
// table and know what they are buying, which does not survive forty granular
// permissions.

export const FEATURES = {
  // Core — in every tier. A gym that cannot do these is not running.
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

/**
 * Every admin route, mapped to the feature that unlocks it.
 *
 * An unmapped route is REFUSED rather than allowed — a route added later
 * without a mapping must fail closed, not become silently free to every tier.
 */
export const ROUTE_FEATURES = {
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
