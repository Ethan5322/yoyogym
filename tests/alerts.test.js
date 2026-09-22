// Platform-level security alerts.
//
// The audit log recorded everything and nothing read it looking for patterns,
// so a hundred failed sign-ins and one failed sign-in looked identical to
// whoever happened to scroll past.
//
// These watch what only the PLATFORM can see: who is trying to get in, who is
// reading applicants' identity documents, which gyms are failing. Nothing here
// concerns a gym's members — that is the gym's own panel (D-044).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { findAlerts, ALERTS, THRESHOLDS, DEFAULT_WINDOW_HOURS } from '../platform/alerts.js';

const NOW = new Date('2026-09-22T12:00:00Z');
const hoursAgo = (n) => new Date(NOW.getTime() - n * 3_600_000).toISOString();

const many = (n, entry) => Array.from({ length: n }, () => ({ created_at: hoursAgo(1), ...entry }));

const codes = (alerts) => alerts.map((a) => a.code);

// ---------------------------------------------------------------------------
// Quiet means quiet
// ---------------------------------------------------------------------------

test('an ordinary day raises nothing', () => {
  const entries = [
    { action: 'platform.login', created_at: hoursAgo(2) },
    { action: 'platform.document.viewed', actor_user_id: 'u1', created_at: hoursAgo(3) },
    { action: 'platform.login.failed', detail: { email: 'a@b.co' }, created_at: hoursAgo(4) },
  ];

  assert.deepEqual(findAlerts(entries, { now: NOW }), [], 'an alert that fires on normal work gets ignored');
});

test('nothing at all is not an error', () => {
  assert.deepEqual(findAlerts([], { now: NOW }), []);
  assert.deepEqual(findAlerts(null, { now: NOW }), []);
});

// ---------------------------------------------------------------------------
// Someone guessing a password
// ---------------------------------------------------------------------------

test('repeated failed sign-ins for one account are raised', () => {
  const alerts = findAlerts(
    many(THRESHOLDS.failedLogins, { action: 'platform.login.failed', detail: { email: 'ann@bos.co' } }),
    { now: NOW }
  );

  assert.ok(codes(alerts).includes(ALERTS.BRUTE_FORCE));
  assert.equal(alerts[0].subject, 'ann@bos.co');
  assert.equal(alerts[0].severity, 'high');
});

test('failures spread across DIFFERENT accounts do not trigger one account alert', () => {
  // Otherwise a busy morning at ten gyms would look like an attack.
  const entries = Array.from({ length: 10 }, (_, i) => ({
    action: 'platform.login.failed',
    detail: { email: `person${i}@gym.co` },
    created_at: hoursAgo(1),
  }));

  assert.ok(!codes(findAlerts(entries, { now: NOW })).includes(ALERTS.BRUTE_FORCE));
});

test('an alert says the innocent explanation out loud', () => {
  // The common case for most of these IS innocent. An alert that does not say
  // so trains people to panic, then to stop reading.
  const alerts = findAlerts(
    many(THRESHOLDS.failedLogins, { action: 'platform.login.failed', detail: { email: 'ann@bos.co' } }),
    { now: NOW }
  );

  assert.match(alerts[0].innocent, /forgotten their password/i);
});

// ---------------------------------------------------------------------------
// Old news is not news
// ---------------------------------------------------------------------------

test('events outside the window are ignored', () => {
  const old = many(20, {
    action: 'platform.login.failed',
    detail: { email: 'ann@bos.co' },
    created_at: hoursAgo(DEFAULT_WINDOW_HOURS + 5),
  });

  assert.deepEqual(findAlerts(old, { now: NOW }), []);
});

// ---------------------------------------------------------------------------
// Someone reading a lot of strangers' ID documents
// ---------------------------------------------------------------------------

test('unusual document access is raised — these are strangers ID scans', () => {
  const alerts = findAlerts(
    many(THRESHOLDS.documentsViewed, { action: 'platform.document.viewed', actor_user_id: 'staff-9' }),
    { now: NOW }
  );

  const alert = alerts.find((a) => a.code === ALERTS.DOCUMENT_BROWSING);
  assert.ok(alert);
  assert.equal(alert.subject, 'staff-9');
  assert.match(alert.innocent, /backlog/i, 'and does not accuse anybody');
});

test('a normal amount of reviewing raises nothing', () => {
  const alerts = findAlerts(
    many(THRESHOLDS.documentsViewed - 1, { action: 'platform.document.viewed', actor_user_id: 'staff-9' }),
    { now: NOW }
  );

  assert.ok(!codes(alerts).includes(ALERTS.DOCUMENT_BROWSING));
});

// ---------------------------------------------------------------------------
// The one with no innocent explanation
// ---------------------------------------------------------------------------

test('an upload claiming a path it was not given is raised as high', () => {
  const alerts = findAlerts(
    [{ action: 'platform.document.rejected_path', created_at: hoursAgo(1) }],
    { now: NOW }
  );

  const alert = alerts.find((a) => a.code === ALERTS.FORGED_PATH);
  assert.equal(alert.severity, 'high');
  assert.match(alert.innocent, /does not happen by accident/i);
});

// ---------------------------------------------------------------------------
// Things that are broken rather than hostile
// ---------------------------------------------------------------------------

test('a failed provision is raised — an approved owner is waiting', () => {
  const alerts = findAlerts([{ action: 'gym.provision.failed', created_at: hoursAgo(1) }], { now: NOW });

  const alert = alerts.find((a) => a.code === ALERTS.PROVISION_FAILED);
  assert.equal(alert.severity, 'high');
  assert.match(alert.detail, /waiting/i);
});

test('a payment matching no invoice is raised', () => {
  const alerts = findAlerts([{ action: 'platform.webhook.unmatched', created_at: hoursAgo(1) }], { now: NOW });
  assert.ok(codes(alerts).includes(ALERTS.UNMATCHED_PAYMENT));
});

// ---------------------------------------------------------------------------
// Order, and what alerts must never do
// ---------------------------------------------------------------------------

test('the worst is first, because a security desk reads from the top', () => {
  const entries = [
    { action: 'platform.webhook.unmatched', created_at: hoursAgo(1) },
    ...many(THRESHOLDS.failedLogins, { action: 'platform.login.failed', detail: { email: 'a@b.co' } }),
  ];

  assert.equal(findAlerts(entries, { now: NOW })[0].severity, 'high');
});

test('NO ALERT LOCKS, SUSPENDS OR SENDS ANYTHING', () => {
  // Every pattern here has an innocent explanation. Acting automatically would
  // lock out the person doing their job on the day they were busiest.
  const alerts = findAlerts(
    many(THRESHOLDS.failedLogins, { action: 'platform.login.failed', detail: { email: 'a@b.co' } }),
    { now: NOW }
  );

  for (const a of alerts) {
    assert.ok(!('action' in a), 'an alert is a fact, not an instruction');
    assert.ok(!('lock' in a) && !('suspend' in a));
    assert.equal(typeof a.detail, 'string');
  }
});
