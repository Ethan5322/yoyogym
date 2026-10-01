// The billing cron. It decides nothing.
//
// Every judgement — is money due, how much, does this gym get suspended — is
// made by platform/billing.js, which is pure and proven. This file only
// carries those decisions out, and its job is to survive contact with the
// world: a timeout mid-run, a second run an hour later, a gym whose row is
// malformed.
//
// >>> IT IS NOT GIVEN A DELETE FUNCTION, AND MUST NEVER BE. <<<
// Suspension stops a gym. Removing its data is a human decision (D-071).
import {
  reviewSubscription, applyChargeResult, invoiceNumber,
  attemptReference, paidSubscriptionPatch, cardOf, staleInvoice,
} from './billing.js';

/**
 * Run one billing pass.
 *
 * DRY RUN IS THE DEFAULT. Going live is an explicit argument, so a stray call
 * — from a test, a console, a misrouted request — cannot take money.
 *
 * @param {object} deps  { listActiveSubscriptions, getPlan, getGym,
 *                         findInvoiceForPeriod, createInvoice, updateInvoice,
 *                         verifyPayment, charge, updateSubscription,
 *                         setGymStatus, notify, audit }
 */
export async function runBilling(deps, { now = new Date(), dryRun = true } = {}) {
  const report = {
    dryRun,
    ran_at: now.toISOString(),
    checked: 0,
    charged: 0,
    failed: 0,
    suspended: 0,
    warned: 0,
    skipped: 0,
    recovered: 0,
    planned: { charge: 0, suspend: 0, warn: 0 },
    purgeEligible: [],
    errors: [],
  };

  const subscriptions = await deps.listActiveSubscriptions();

  for (const sub of subscriptions) {
    report.checked += 1;
    try {
      await handleOne(sub, deps, { now, dryRun, report });
    } catch (err) {
      // One gym's failure is one gym's failure. Letting it escape would leave
      // every gym after it in the list unbilled, and the list has no
      // guaranteed order — so the same gyms would be missed every night.
      report.errors.push({ gym_id: sub.gym_id, subscription_id: sub.id, error: err?.message || String(err) });
    }
  }

  await deps.audit?.({
    action: dryRun ? 'platform.billing.dry_run' : 'platform.billing.run',
    actor_kind: 'system',
    detail: {
      checked: report.checked,
      charged: report.charged,
      suspended: report.suspended,
      errors: report.errors.length,
    },
  });

  return report;
}

async function handleOne(sub, deps, { now, dryRun, report }) {
  const plan = sub.plan_id ? await deps.getPlan(sub.plan_id) : null;
  const review = reviewSubscription(sub, { plan, now });

  switch (review.action) {
    case 'none':
      if (/price/i.test(review.reason || '')) report.skipped += 1;
      return;

    case 'purge_eligible':
      // Reported and nothing else. Deliberately.
      report.purgeEligible.push({
        gym_id: sub.gym_id,
        days_suspended: review.days_suspended,
        reason: review.reason,
      });
      return;

    case 'warn_trial_ending':
      report.planned.warn += 1;
      if (dryRun) return;
      report.warned += 1;
      return notifyOwner(deps, sub, { kind: 'trial_ending', trial_ends_at: review.trial_ends_at });

    case 'warn_grace':
      report.planned.warn += 1;
      if (dryRun) return;
      report.warned += 1;
      return notifyOwner(deps, sub, { kind: 'payment_overdue', grace_ends_at: sub.grace_ends_at });

    case 'suspend':
      report.planned.suspend += 1;
      if (dryRun) return;
      await deps.updateSubscription(sub.id, review.patch);
      // The gym's own status is what tenancy resolution reads on every
      // request. Without this line the gym keeps serving.
      await deps.setGymStatus(sub.gym_id, 'suspended');
      await deps.audit?.({
        action: 'platform.gym.suspended',
        actor_kind: 'system',
        entity: 'gym',
        entity_id: sub.gym_id,
        detail: { reason: review.reason },
      });
      report.suspended += 1;
      return notifyOwner(deps, sub, { kind: 'gym_suspended' });

    case 'cancel':
      if (dryRun) return;
      await deps.updateSubscription(sub.id, review.patch);
      await deps.setGymStatus(sub.gym_id, 'cancelled');
      return notifyOwner(deps, sub, { kind: 'subscription_ended' });

    case 'charge':
      return charge(sub, plan, review, deps, { now, dryRun, report });

    default:
      report.errors.push({ gym_id: sub.gym_id, error: `Unknown action: ${review.action}` });
  }
}

async function charge(sub, plan, review, deps, { now, dryRun, report }) {
  const periodEnd = sub.current_period_end ?? sub.trial_ends_at;

  // THE DOUBLE-CHARGE GUARD. One invoice per gym per period: the invoice is
  // the record, so the invoice is the check.
  const existing = await deps.findInvoiceForPeriod(sub.gym_id, periodEnd);

  // Paid already, but the subscription still says the period is over: the
  // payment's month was never recorded on it. Recorded now, from the
  // invoice — never charged again.
  if (existing?.status === 'paid') {
    if (dryRun) return;
    const paidAt = existing.paid_at ? new Date(existing.paid_at) : now;
    await deps.updateSubscription(sub.id, paidSubscriptionPatch({ periodEnd: existing.period_end ?? periodEnd, now: paidAt }));
    report.recovered += 1;
    return;
  }

  // Raised hours ago — by a run earlier today whose charge may still be on
  // its way, or by an owner who has Pay now open — and so left alone. Before
  // CLAUDE.md §49 EVERY unpaid invoice was left alone, for ever: an owner who
  // opened Pay now and walked away was never charged, never overdue and never
  // suspended.
  if (existing && !staleInvoice(existing, now)) return;

  report.planned.charge += 1;
  if (dryRun) return;

  let invoice;
  let reference;

  if (existing) {
    // Paid on Paystack with nothing recorded (the page closed, the webhook
    // lost)? Then record it — a second charge would take the month twice.
    const earlier = existing.provider_ref ? await deps.verifyPayment?.(existing.provider_ref).catch(() => null) : null;
    if (earlier?.status === 'success' && Number(earlier.amount) === Number(existing.amount_cents)) {
      await deps.updateInvoice(existing.id, { status: 'paid', paid_at: now.toISOString() });
      await deps.updateSubscription(sub.id, paidSubscriptionPatch({ periodEnd: existing.period_end ?? periodEnd, card: cardOf(earlier), now }));
      await deps.audit?.({
        action: 'platform.invoice.recovered',
        actor_kind: 'system',
        entity: 'invoice',
        entity_id: existing.id,
        detail: { gym_id: sub.gym_id, reference: existing.provider_ref },
      });
      report.planned.charge -= 1;
      report.recovered += 1;
      return;
    }
    // Not paid: tried again on this same invoice, under a reference of its
    // own (Paystack refuses one it has seen before).
    invoice = existing;
    reference = attemptReference(existing.number, now);
    await deps.updateInvoice(existing.id, { provider_ref: reference, status: 'issued' });
  } else {
    reference = invoiceNumber(Date.now() % 1_000_000, now);
    // The invoice is written BEFORE the money is asked for. If the process
    // dies mid-charge, an unpaid invoice is a question a human can answer; a
    // charge with no invoice is money taken with no record of why.
    invoice = await deps.createInvoice({
      gym_id: sub.gym_id,
      subscription_id: sub.id,
      number: reference,
      status: 'issued',
      amount_cents: review.amount_cents,
      currency: review.currency,
      issued_at: now.toISOString(),
      due_at: now.toISOString(),
      provider: 'paystack',
      provider_ref: reference,
      period_end: periodEnd,
    });
  }

  const gym = await deps.getGym(sub.gym_id);

  const result = await deps.charge({
    gymId: sub.gym_id,
    email: gym?.owner_email,
    // The invoice's amount when it already existed: the month is charged at
    // the price it was raised at.
    amountCents: invoice.amount_cents ?? review.amount_cents,
    reference,
    // The card the owner authorised when they paid on the web. No code, no
    // renewal — and the runner reports that rather than pretending.
    authorizationCode: sub.paystack_auth_code ?? null,
  });

  const { patch, notify } = applyChargeResult(sub, result, now);
  await deps.updateSubscription(sub.id, patch);
  await deps.updateInvoice(invoice.id, {
    status: result.ok ? 'paid' : 'overdue',
    paid_at: result.ok ? now.toISOString() : null,
  });

  if (result.ok) report.charged += 1;
  else report.failed += 1;

  return notifyOwner(deps, sub, { kind: notify, amount_cents: review.amount_cents });
}

/** Notifications never throw into the run: a failed email is not a failed bill. */
async function notifyOwner(deps, sub, payload) {
  try {
    await deps.notify?.({ gym_id: sub.gym_id, ...payload });
  } catch {
    /* ignored on purpose */
  }
}
