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
  'face-learn': FEATURES.FACE,
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

/**
 * The member portal's routes (/api/member/*).
 *
 * A SEPARATE MAP, not more keys in the one above: the two routers share route
 * names that mean different things. `profile` is staff management on the admin
 * side (STAFF) and the member's own details here (MEMBERS).
 *
 * Until this existed the member router checked no plan at all, so a BASIC
 * gym's members could book classes, message the gym, log progress, refer
 * friends and sign in by face — every one a MEDIUM or PRIME feature.
 *
 * `request-deletion` is MEMBERS, which every plan includes, and must stay so:
 * a member's right to ask for their data to be erased is not a paid feature.
 */
export const MEMBER_ROUTE_FEATURES = {
  login: FEATURES.MEMBERS,
  status: FEATURES.MEMBERS,
  history: FEATURES.MEMBERS,
  profile: FEATURES.MEMBERS,
  'request-plan-change': FEATURES.MEMBERS,
  'request-deletion': FEATURES.MEMBERS,
  checkin: FEATURES.CHECKIN,

  classes: FEATURES.CLASSES,
  'book-class': FEATURES.CLASSES,
  'cancel-booking': FEATURES.CLASSES,
  message: FEATURES.MESSAGING,
  messages: FEATURES.MESSAGING,
  announcements: FEATURES.MESSAGING,
  progress: FEATURES.PROGRESS,

  refer: FEATURES.REFERRALS,
  'face-login': FEATURES.FACE,
  'enroll-face': FEATURES.FACE,
};

/**
 * Staff sign-in (/api/auth/*). Signing in is core; signing in BY FACE is the
 * PRIME face-recognition feature, the same as it is for members.
 */
export const AUTH_ROUTE_FEATURES = {
  login: FEATURES.MEMBERS,
  me: FEATURES.MEMBERS,
  'change-password': FEATURES.MEMBERS,
  'face-login': FEATURES.FACE,
};

export const featureForRoute = (route, map = ROUTE_FEATURES) => map[route] ?? null;

// ---------------------------------------------------------------------------
// The services, as people read them (CLAUDE.md §41)
// ---------------------------------------------------------------------------

/**
 * Always included, in every plan, and never switched off by anyone. A gym that
 * cannot register members, check them in, record payments, write its own
 * plans, set its name, add staff or print its QR codes is not running.
 */
export const CORE_FEATURES = [
  FEATURES.MEMBERS,
  FEATURES.CHECKIN,
  FEATURES.PAYMENTS,
  FEATURES.CATALOG,
  FEATURES.SETTINGS,
  FEATURES.STAFF,
  FEATURES.QR,
];

/**
 * Every service: what an owner reads, what a member gets (null when it is a
 * tool for running the gym rather than something members use), and the group
 * it is listed under. The ONE place a service is named, for the main admin
 * panel, the registration page, the owner's settings and the members' screens.
 */
export const SERVICE_INFO = {
  [FEATURES.MEMBERS]: { label: 'Member registration and records', group: 'core', forMembers: 'Join online in minutes, from their phone' },
  [FEATURES.CHECKIN]: { label: 'Check-in and door verification', group: 'core', forMembers: 'Check themselves in with a QR code' },
  [FEATURES.PAYMENTS]: { label: 'Payment records, receipts and arrears', group: 'core', forMembers: 'See their membership status and what they owe' },
  [FEATURES.CATALOG]: { label: 'Your own membership plans and add-ons', group: 'core', forMembers: null },
  [FEATURES.SETTINGS]: { label: "Your gym's own name, logo, colours and pictures", group: 'core', forMembers: 'Your gym\'s own branded app' },
  [FEATURES.STAFF]: { label: 'Staff accounts and roles', group: 'core', forMembers: null },
  [FEATURES.QR]: { label: 'QR codes and posters for your gym and members', group: 'core', forMembers: 'A digital membership card with a QR code' },
  [FEATURES.CLASSES]: { label: 'Classes, bookings and waitlists', group: 'members', forMembers: 'Book classes and join a waitlist' },
  [FEATURES.TRAINERS]: { label: 'Trainers and personal training', group: 'running', forMembers: 'Train with a trainer and see their workout notes' },
  [FEATURES.MESSAGING]: { label: 'Announcements and member messaging', group: 'members', forMembers: 'Message the gym and get its announcements' },
  [FEATURES.REPORTING]: { label: 'Attendance and revenue reports', group: 'running', forMembers: null },
  [FEATURES.PROGRESS]: { label: 'Member progress tracking', group: 'members', forMembers: 'Track their own progress over time' },
  [FEATURES.DATA_IO]: { label: 'Import and export your data', group: 'running', forMembers: null },
  [FEATURES.FACE]: { label: 'Face recognition at the door', group: 'members', forMembers: 'Walk in with face recognition — no card, no code' },
  [FEATURES.ACCESS_CONTROL]: { label: 'Visitor passes and incident log', group: 'running', forMembers: 'Bring a guest with a visitor pass' },
  [FEATURES.ADVANCED_ANALYTICS]: { label: 'Churn, retention and peak-hour analytics', group: 'running', forMembers: null },
  [FEATURES.MARKETING]: { label: 'Bulk email to your members', group: 'running', forMembers: null },
  [FEATURES.REFERRALS]: { label: 'Member referral programme', group: 'members', forMembers: 'Refer friends and be credited for it' },
  [FEATURES.AUDIT]: { label: 'Full audit log of staff actions', group: 'running', forMembers: null },
};

export const SERVICE_GROUPS = [
  ['core', 'Always included'],
  ['members', "Your members' app"],
  ['running', 'Running your gym'],
];

/**
 * What an OWNER may switch off for their members (§41 Q2): the services
 * members use directly. Core services stay on; tools for running the gym are
 * the owner's own screens, which they simply do not open.
 */
export const OWNER_SWITCHABLE = [
  FEATURES.CLASSES,
  FEATURES.MESSAGING,
  FEATURES.PROGRESS,
  FEATURES.FACE,
  FEATURES.REFERRALS,
];

/** Every service key, in display order. */
export const ALL_SERVICES = Object.keys(SERVICE_INFO);

const known = (list) => (Array.isArray(list) ? list.filter((f) => ALL_SERVICES.includes(f)) : []);

/**
 * What ONE gym may use: its plan's services, plus what the platform added for
 * this gym, minus what it took away (§41 Q2). Core services survive any
 * removal — a gym without them is not running. Unknown keys are dropped, so a
 * typo in the registry grants nothing.
 */
export function effectiveFeatures(planFeatures, added = [], removed = []) {
  const set = new Set(known(planFeatures));
  for (const f of known(added)) set.add(f);
  for (const f of known(removed)) if (!CORE_FEATURES.includes(f)) set.delete(f);
  for (const f of CORE_FEATURES) if (Array.isArray(planFeatures)) set.add(f);
  return ALL_SERVICES.filter((f) => set.has(f));
}
