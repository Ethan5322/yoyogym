// Platform-level security alerts (CLAUDE.md §16).
//
//   >>> THIS IS THE PLATFORM'S SECURITY, NOT A GYM'S. <<<
//
// Nothing here concerns a gym's members, its check-ins or its takings. Those
// belong to that gym's own admin panel and the platform never sees them
// (D-044). This watches the things only the platform can see: who is trying to
// get into the platform, who is reading applicants' identity documents, and
// which gyms are failing.
//
// The audit log already records all of it. Until now nothing read it looking
// for patterns, which meant a hundred failed sign-ins and one failed sign-in
// looked exactly the same to whoever happened to scroll past.
//
// ============================================================================
// WHY THESE ARE ALERTS AND NOT ACTIONS
// ============================================================================
//
// Nothing here locks an account, suspends a gym or sends anything. Every one
// of these patterns has an innocent explanation — a reviewer genuinely working
// through forty applications, a staff member on a new phone failing 2FA six
// times, a payment provider retrying. Acting automatically on any of them
// would lock out the person doing their job on the day they were busiest.
//
// They are surfaced so a person looks. That is the whole design.

/** How far back an alert pass considers. A day is what a daily read wants. */
export const DEFAULT_WINDOW_HOURS = 24;

export const ALERTS = {
  BRUTE_FORCE: 'repeated_failed_logins',
  STAFF_NO_2FA: 'staff_blocked_no_2fa',
  DOCUMENT_BROWSING: 'unusual_document_access',
  FORGED_PATH: 'document_path_rejected',
  UNMATCHED_PAYMENT: 'unmatched_payment',
  PROVISION_FAILED: 'provisioning_failed',
};

/**
 * Thresholds, in one place and named.
 *
 * Every number here is a judgement, so it is written down rather than buried
 * in a comparison. They are deliberately generous: an alert that fires on
 * ordinary work is an alert people learn to close without reading.
 */
export const THRESHOLDS = {
  failedLogins: 5,
  documentsViewed: 30,
};

const at = (entry) => new Date(entry?.created_at ?? 0).getTime();

/**
 * Turn audit entries into things worth a person's attention.
 *
 * Pure: entries in, alerts out. No database, no clock beyond what is passed.
 *
 * @param {Array} entries audit rows, newest first or not — order is irrelevant
 * @param {object} options { now, windowHours }
 */
export function findAlerts(entries, { now = new Date(), windowHours = DEFAULT_WINDOW_HOURS } = {}) {
  const rows = Array.isArray(entries) ? entries : [];
  const since = now.getTime() - windowHours * 3_600_000;
  const recent = rows.filter((e) => at(e) >= since);

  const alerts = [];

  // ---- someone guessing a password ---------------------------------------
  const failuresByEmail = new Map();
  for (const e of recent) {
    if (e.action !== 'platform.login.failed') continue;
    const who = e.detail?.email || '(unknown)';
    failuresByEmail.set(who, (failuresByEmail.get(who) ?? 0) + 1);
  }

  for (const [email, count] of failuresByEmail) {
    if (count < THRESHOLDS.failedLogins) continue;
    alerts.push({
      code: ALERTS.BRUTE_FORCE,
      severity: 'high',
      subject: email,
      count,
      detail: `${count} failed sign-in attempts for ${email} in the last ${windowHours} hours.`,
      // Said plainly, because the innocent explanation is the common one.
      innocent: 'A person who has forgotten their password looks exactly like this.',
    });
  }

  // ---- a staff account that cannot sign in -------------------------------
  const blocked = recent.filter((e) => e.action === 'platform.login.blocked_no_2fa');
  if (blocked.length) {
    alerts.push({
      code: ALERTS.STAFF_NO_2FA,
      severity: 'medium',
      count: blocked.length,
      detail: `A staff account was refused ${blocked.length} time(s) because it has no two-factor authentication.`,
      innocent: 'Somebody new whose authenticator app has not been set up yet — finish setting it up.',
    });
  }

  // ---- somebody reading a lot of identity documents ----------------------
  // The insider-risk signal. These are strangers' ID documents, and a person
  // steadily working through them looks different from a person browsing.
  const viewsByUser = new Map();
  for (const e of recent) {
    if (e.action !== 'platform.document.viewed') continue;
    const who = e.actor_user_id || '(unknown)';
    viewsByUser.set(who, (viewsByUser.get(who) ?? 0) + 1);
  }

  for (const [userId, count] of viewsByUser) {
    if (count < THRESHOLDS.documentsViewed) continue;
    alerts.push({
      code: ALERTS.DOCUMENT_BROWSING,
      severity: 'medium',
      subject: userId,
      count,
      detail: `${count} identity documents opened by one user in the last ${windowHours} hours.`,
      innocent: 'A reviewer working through a backlog. Worth asking, not worth assuming.',
    });
  }

  // ---- an upload claiming a path it was not given ------------------------
  // No innocent explanation for this one, which is why it is the only 'high'
  // that says so.
  const forged = recent.filter((e) => e.action === 'platform.document.rejected_path');
  if (forged.length) {
    alerts.push({
      code: ALERTS.FORGED_PATH,
      severity: 'high',
      count: forged.length,
      detail: `${forged.length} upload(s) tried to attach a file to an application they do not own.`,
      innocent: 'This one does not happen by accident. The requests were refused.',
    });
  }

  // ---- money that matches nothing ----------------------------------------
  const unmatched = recent.filter((e) => e.action === 'platform.webhook.unmatched');
  if (unmatched.length) {
    alerts.push({
      code: ALERTS.UNMATCHED_PAYMENT,
      severity: 'medium',
      count: unmatched.length,
      detail: `${unmatched.length} payment notification(s) matched no invoice.`,
      innocent: 'Often a payment for something else, or a test transaction. Worth reconciling.',
    });
  }

  // ---- a gym that failed to be created -----------------------------------
  const failed = recent.filter((e) => e.action === 'gym.provision.failed');
  if (failed.length) {
    alerts.push({
      code: ALERTS.PROVISION_FAILED,
      severity: 'high',
      count: failed.length,
      detail: `${failed.length} gym(s) failed to provision. An approved owner is waiting.`,
      innocent: 'Usually a transient database or API failure. The owner cannot open their gym until it is fixed.',
    });
  }

  // Worst first: a security desk reads from the top and stops when it runs
  // out of time.
  const rank = { high: 0, medium: 1, low: 2 };
  return alerts.sort((a, b) => rank[a.severity] - rank[b.severity] || b.count - a.count);
}
