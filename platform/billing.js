// Subscription lifecycle — gyms paying the platform.
//
//   >>> NOTHING HERE TOUCHES A MEMBER'S MONEY. <<<
//
// Members pay their gym, in cash, at the desk (D-013). That is the gym's
// business and the gym's Paystack account. This file is only about the gym's
// subscription to Yoyo Gyms.
//
// Every function is pure and takes `now`. There is no clock, no network and no
// database in this file, which is the only reason a 30-day trial and a 90-day
// suspension window can be tested in milliseconds.
//
// The side effects live in platform/billing-runner.js, which decides nothing.

/** The free trial, in days (D-070). */
export const TRIAL_DAYS = 30;

/** How long access continues after a payment fails (D-026). */
export const GRACE_DAYS = 2;

/** After this long suspended, a gym is REPORTED. Never deleted (D-071). */
export const PURGE_AFTER_SUSPENDED_DAYS = 90;

/** How many days before the trial ends the owner is warned. */
export const TRIAL_WARNING_DAYS = 3;

const DAY_MS = 86_400_000;
const iso = (d) => new Date(d).toISOString();
const plus = (from, days) => new Date(new Date(from).getTime() + days * DAY_MS);
const ms = (value) => (value ? new Date(value).getTime() : null);

/** Statuses under which a gym may keep using the system. */
const SERVING = new Set(['trialing', 'active', 'past_due']);

/**
 * Open a trial for a newly provisioned gym.
 *
 * No card is asked for and no money moves. A gym that has just been approved
 * has not yet seen the product; asking it to pay first would be asking it to
 * buy something it cannot look at.
 */
export function startTrial({ gymId, plan, now = new Date() }) {
  return {
    gym_id: gymId,
    plan_id: plan?.id ?? null,
    status: 'trialing',
    trial_ends_at: iso(plus(now, TRIAL_DAYS)),
    current_period_start: iso(now),
    current_period_end: iso(plus(now, TRIAL_DAYS)),
    grace_ends_at: null,
  };
}

/**
 * May this gym be served right now?
 *
 * Read on every request through the platform, so it must be cheap, and it must
 * FAIL CLOSED: a status this file does not recognise is a refusal, not a pass.
 * A new status added to the database by hand is then visibly broken rather
 * than silently granting free access forever.
 *
 * @returns {{allowed: boolean, state: string, httpStatus: number, message: string}}
 */
export function accessFor(subscription, now = new Date()) {
  if (!subscription) {
    return refuse('none', 402, 'This gym has no active subscription.');
  }

  const status = subscription.status;

  if (!SERVING.has(status)) {
    // 402 Payment Required, not 403 Forbidden. The distinction matters to
    // whoever is reading the response: 403 says "you may not", 402 says
    // "pay and you may". Only one of those tells the owner what to do.
    if (status === 'suspended') return refuse(status, 402, 'This gym is suspended for non-payment.');
    if (status === 'cancelled' || status === 'expired') {
      return refuse(status, 402, 'This gym’s subscription has ended.');
    }
    return refuse(status || 'unknown', 402, 'This gym has no active subscription.');
  }

  // past_due still serves — that is what a grace window IS. Cutting a gym off
  // the moment a card is declined would shut the doors on paying members
  // because of a bank's retry policy.
  if (status === 'past_due') {
    const graceEnd = ms(subscription.grace_ends_at);
    if (graceEnd !== null && now.getTime() >= graceEnd) {
      return refuse('past_due', 402, 'Payment is overdue.');
    }
  }

  return { allowed: true, state: status, httpStatus: 200, message: '' };
}

const refuse = (state, httpStatus, message) => ({ allowed: false, state, httpStatus, message });

/**
 * What, if anything, should happen to this subscription today?
 *
 * Returns an INTENT. It changes nothing itself, so the same call can be made
 * in a dry run and in earnest, and the two are guaranteed to agree.
 *
 * action: none | warn_trial_ending | charge | suspend | cancel | purge_eligible
 */
export function reviewSubscription(subscription, { plan = null, now = new Date() } = {}) {
  if (!subscription) return { action: 'none', reason: 'No subscription.' };

  const status = subscription.status;
  const t = now.getTime();

  // ---- suspended: count the days, then tell a human -----------------------
  if (status === 'suspended') {
    const since = ms(subscription.suspended_at);
    if (since !== null && t - since >= PURGE_AFTER_SUSPENDED_DAYS * DAY_MS) {
      return {
        action: 'purge_eligible',
        // Deliberately not a deletion. This function has no delete to call and
        // the runner has none either: removing a gym's data is a human
        // decision, taken deliberately, after someone has looked (D-071).
        reason: `Suspended for over ${PURGE_AFTER_SUSPENDED_DAYS} days. A human must decide what happens to this gym's data.`,
        days_suspended: Math.floor((t - since) / DAY_MS),
      };
    }
    return { action: 'none', reason: 'Suspended; within the retention window.' };
  }

  if (status === 'cancelled' || status === 'expired') {
    return { action: 'none', reason: `Subscription is ${status}.` };
  }

  // ---- past due: the grace window is the only thing that matters ----------
  if (status === 'past_due') {
    const graceEnd = ms(subscription.grace_ends_at);
    if (graceEnd !== null && t >= graceEnd) {
      return {
        action: 'suspend',
        reason: 'The grace window closed with the invoice unpaid.',
        patch: { status: 'suspended', suspended_at: iso(now), updated_at: iso(now) },
      };
    }
    return { action: 'warn_grace', reason: 'Payment failed; inside the grace window.' };
  }

  // ---- a subscription the owner has asked to end --------------------------
  const cancelAt = ms(subscription.cancel_at);
  if (cancelAt !== null && t >= cancelAt) {
    return {
      action: 'cancel',
      reason: 'The period the gym paid for has ended.',
      patch: { status: 'cancelled', cancelled_at: iso(now), updated_at: iso(now) },
    };
  }

  // ---- is money due? ------------------------------------------------------
  const dueAt = ms(subscription.current_period_end ?? subscription.trial_ends_at);
  const owes = dueAt !== null && t >= dueAt;

  if (owes) {
    // A plan with no price is not free — it is UNPRICED (D-058). There is
    // nothing to charge, so nothing is charged, and crucially the gym is not
    // suspended for failing to pay an amount nobody ever set.
    if (!Number.isInteger(plan?.price_cents) || plan.price_cents <= 0) {
      return { action: 'none', reason: 'This plan has no price set, so there is nothing to charge.' };
    }
    return {
      action: 'charge',
      reason: status === 'trialing' ? 'The trial has ended.' : 'The billing period has ended.',
      amount_cents: plan.price_cents,
      currency: plan.currency || 'ZAR',
    };
  }

  if (status === 'trialing' && dueAt !== null && dueAt - t <= TRIAL_WARNING_DAYS * DAY_MS) {
    return {
      action: 'warn_trial_ending',
      reason: 'The trial ends soon.',
      trial_ends_at: iso(dueAt),
    };
  }

  return { action: 'none', reason: 'Nothing is due.' };
}

/**
 * Turn the outcome of a charge attempt into a database patch.
 *
 * A failure is never terminal on its own: it opens the grace window, and only
 * the window closing suspends anything.
 */
export function applyChargeResult(subscription, result, now = new Date()) {
  if (result?.ok) {
    const periodStart = now;
    return {
      patch: {
        status: 'active',
        grace_ends_at: null,
        current_period_start: iso(periodStart),
        current_period_end: iso(plus(periodStart, 30)),
        updated_at: iso(now),
      },
      notify: 'payment_received',
    };
  }

  return {
    patch: {
      status: 'past_due',
      grace_ends_at: iso(plus(now, GRACE_DAYS)),
      updated_at: iso(now),
    },
    notify: 'payment_failed',
  };
}

/**
 * Read a Paystack webhook and say what it means, or say it means nothing.
 *
 * Webhooks are attacker-reachable input. This translates rather than trusts:
 * an event it does not recognise, or one with no reference to tie it to an
 * invoice, produces `ignore`. Guessing which invoice a payment belongs to
 * would mark the wrong gym paid.
 */
export function eventToIntent(payload) {
  const event = payload?.event;
  const reference = payload?.data?.reference;

  if (!reference) return { kind: 'ignore', reason: 'No reference; nothing can be matched to it.' };

  if (event === 'charge.success' || event === 'invoice.payment_succeeded') {
    return {
      kind: 'payment_succeeded',
      reference,
      // The AMOUNT IS NOT TRUSTED as the source of truth for what was owed;
      // it is recorded so a mismatch with the invoice can be spotted.
      amount_cents: Number.isFinite(payload?.data?.amount) ? payload.data.amount : null,
    };
  }

  if (event === 'invoice.payment_failed' || event === 'charge.failed') {
    return { kind: 'payment_failed', reference };
  }

  if (event === 'subscription.disable') {
    return { kind: 'subscription_cancelled', reference };
  }

  return { kind: 'ignore', reason: `Unhandled event: ${event}` };
}

/** Human-readable invoice number: YG-2026-000123. */
export function invoiceNumber(sequence, now = new Date()) {
  return `YG-${new Date(now).getUTCFullYear()}-${String(sequence).padStart(6, '0')}`;
}
