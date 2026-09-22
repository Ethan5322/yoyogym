// Subscription lifecycle tests, written before the implementation.
//
// This is the money path for the PLATFORM's own income: gyms paying us
// (D-013). Member billing is a different thing entirely and is on hold.
//
// Everything here is pure. No clock, no network, no database — `now` is always
// passed in, which is the only way a 30-day trial and a 90-day suspension are
// testable at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  TRIAL_DAYS,
  GRACE_DAYS,
  PURGE_AFTER_SUSPENDED_DAYS,
  startTrial,
  accessFor,
  reviewSubscription,
  applyChargeResult,
  eventToIntent,
} from '../platform/billing.js';

const T0 = new Date('2026-01-01T00:00:00Z');
const days = (n, from = T0) => new Date(from.getTime() + n * 86400_000);

const PLAN = { id: 'plan-basic', key: 'basic', price_cents: 49900, currency: 'ZAR' };
const UNPRICED = { id: 'plan-basic', key: 'basic', price_cents: null, currency: 'ZAR' };

// ---------------------------------------------------------------------------
// The trial
// ---------------------------------------------------------------------------

test('a new gym starts on a trial, with access, and is charged nothing', () => {
  const sub = startTrial({ gymId: 'g1', plan: PLAN, now: T0 });

  assert.equal(sub.status, 'trialing');
  assert.equal(sub.gym_id, 'g1');
  assert.equal(sub.plan_id, 'plan-basic');
  assert.equal(new Date(sub.trial_ends_at).toISOString(), days(TRIAL_DAYS).toISOString());
  assert.equal(accessFor(sub, T0).allowed, true);
});

test('a trial about to end warns, and access continues', () => {
  const sub = startTrial({ gymId: 'g1', plan: PLAN, now: T0 });
  const review = reviewSubscription(sub, { plan: PLAN, now: days(TRIAL_DAYS - 2) });

  assert.equal(review.action, 'warn_trial_ending');
  assert.equal(accessFor(sub, days(TRIAL_DAYS - 2)).allowed, true);
});

test('when the trial ends the gym is CHARGED, not suspended', () => {
  // A gym that has done nothing wrong must never be cut off without the
  // platform first trying to take the money it is owed.
  const sub = startTrial({ gymId: 'g1', plan: PLAN, now: T0 });
  const review = reviewSubscription(sub, { plan: PLAN, now: days(TRIAL_DAYS) });

  assert.equal(review.action, 'charge');
  assert.equal(review.amount_cents, 49900);
});

// ---------------------------------------------------------------------------
// A plan with no price
// ---------------------------------------------------------------------------

test('a plan with no price is never charged, and never suspended for not paying', () => {
  // Prices are NULL until the user sets them (D-058). Charging 0, or cutting a
  // gym off over a price that was never set, are both wrong.
  const sub = startTrial({ gymId: 'g1', plan: UNPRICED, now: T0 });
  const review = reviewSubscription(sub, { plan: UNPRICED, now: days(TRIAL_DAYS + 30) });

  assert.equal(review.action, 'none');
  assert.match(review.reason, /price/i);
  assert.equal(accessFor(sub, days(TRIAL_DAYS + 30)).allowed, true);
});

// ---------------------------------------------------------------------------
// A failed payment
// ---------------------------------------------------------------------------

test('a failed charge opens a grace window and access CONTINUES through it', () => {
  const sub = startTrial({ gymId: 'g1', plan: PLAN, now: T0 });
  const at = days(TRIAL_DAYS);
  const { patch } = applyChargeResult(sub, { ok: false }, at);

  assert.equal(patch.status, 'past_due');
  assert.equal(new Date(patch.grace_ends_at).toISOString(), days(TRIAL_DAYS + GRACE_DAYS).toISOString());

  const pastDue = { ...sub, ...patch };
  assert.equal(accessFor(pastDue, days(TRIAL_DAYS + 1)).allowed, true, 'grace means grace');
});

test('when the grace window closes the gym is suspended', () => {
  const sub = {
    gym_id: 'g1',
    status: 'past_due',
    grace_ends_at: days(TRIAL_DAYS + GRACE_DAYS).toISOString(),
  };
  const review = reviewSubscription(sub, { plan: PLAN, now: days(TRIAL_DAYS + GRACE_DAYS + 0.1) });

  assert.equal(review.action, 'suspend');
  assert.equal(review.patch.status, 'suspended');
});

test('a suspended gym is refused with 402, not 403 — it is money, not permission', () => {
  const sub = { gym_id: 'g1', status: 'suspended', suspended_at: T0.toISOString() };
  const access = accessFor(sub, days(1));

  assert.equal(access.allowed, false);
  assert.equal(access.httpStatus, 402);
});

test('a successful charge clears the grace window and restores access', () => {
  const sub = {
    gym_id: 'g1',
    status: 'past_due',
    grace_ends_at: days(TRIAL_DAYS + GRACE_DAYS).toISOString(),
  };
  const { patch } = applyChargeResult(sub, { ok: true }, days(TRIAL_DAYS + 1));

  assert.equal(patch.status, 'active');
  assert.equal(patch.grace_ends_at, null);
  assert.equal(accessFor({ ...sub, ...patch }, days(TRIAL_DAYS + 1)).allowed, true);
});

// ---------------------------------------------------------------------------
// Suspension is not deletion
// ---------------------------------------------------------------------------

test('a long-suspended gym becomes a REPORT, never an automatic deletion', () => {
  const sub = { gym_id: 'g1', status: 'suspended', suspended_at: T0.toISOString() };
  const review = reviewSubscription(sub, { plan: PLAN, now: days(PURGE_AFTER_SUSPENDED_DAYS + 1) });

  assert.equal(review.action, 'purge_eligible');
  assert.ok(!('delete' in review), 'nothing here may delete a gym');
  assert.match(review.reason, /human/i);
});

test('a gym suspended for less than the window is left alone', () => {
  const sub = { gym_id: 'g1', status: 'suspended', suspended_at: T0.toISOString() };
  assert.equal(reviewSubscription(sub, { plan: PLAN, now: days(10) }).action, 'none');
});

// ---------------------------------------------------------------------------
// Cancellation
// ---------------------------------------------------------------------------

test('a cancelled subscription keeps access until the period it paid for ends', () => {
  const sub = {
    gym_id: 'g1',
    status: 'active',
    cancel_at: days(20).toISOString(),
    current_period_end: days(20).toISOString(),
  };

  assert.equal(accessFor(sub, days(10)).allowed, true, 'they paid for this month');

  const review = reviewSubscription(sub, { plan: PLAN, now: days(21) });
  assert.equal(review.action, 'cancel');
  assert.equal(review.patch.status, 'cancelled');
});

test('a cancelled subscription has no access once the period is over', () => {
  const sub = { gym_id: 'g1', status: 'cancelled', cancelled_at: days(20).toISOString() };
  assert.equal(accessFor(sub, days(21)).allowed, false);
});

// ---------------------------------------------------------------------------
// Failing closed
// ---------------------------------------------------------------------------

test('an unrecognised status refuses access rather than allowing it', () => {
  assert.equal(accessFor({ status: 'something_new' }, T0).allowed, false);
});

test('no subscription at all refuses access', () => {
  assert.equal(accessFor(null, T0).allowed, false);
});

// ---------------------------------------------------------------------------
// Paystack events
// ---------------------------------------------------------------------------

test('a successful charge event is an intent to mark paid', () => {
  const intent = eventToIntent({ event: 'charge.success', data: { reference: 'INV-1', amount: 49900 } });

  assert.equal(intent.kind, 'payment_succeeded');
  assert.equal(intent.reference, 'INV-1');
});

test('a failed invoice event is an intent to mark the subscription past due', () => {
  const intent = eventToIntent({ event: 'invoice.payment_failed', data: { reference: 'INV-1' } });
  assert.equal(intent.kind, 'payment_failed');
});

test('an unknown event is ignored, not guessed at', () => {
  assert.equal(eventToIntent({ event: 'customer.wombat', data: {} }).kind, 'ignore');
});

test('an event with no reference cannot be acted on', () => {
  // Without a reference there is no way to know WHICH invoice was paid.
  // Guessing would mark the wrong gym paid.
  assert.equal(eventToIntent({ event: 'charge.success', data: {} }).kind, 'ignore');
});
