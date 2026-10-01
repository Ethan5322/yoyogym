// A gym owner paying their subscription.
//
//   >>> THE ONLY MONEY YOYO GYMS EVER HANDLES. <<<
//
// A member pays their own gym — cash at GYM K, EFT at GYM Q, whatever each gym
// does — and that money never touches the platform (D-013). This is the other
// payment entirely: the gym owner paying Yoyo Gyms for the software.
//
// ON THE WEB, NEVER IN THE APP (D-060). Apple and Google take 15–30% of a
// digital subscription bought inside an app; Paystack takes about 3%. The app
// therefore sells nothing, shows no price and links to no payment page, which
// is also what the stores' anti-steering rules require.
//
// ============================================================================
// TWO RULES THAT THE WHOLE THING RESTS ON
// ============================================================================
//
// 1. THE AMOUNT IS NEVER TAKEN FROM THE REQUEST. It is read from the plan, in
//    this file, every time. A price that arrives from a browser is a price the
//    payer chose.
//
// 2. THE CALLBACK IS NEVER BELIEVED. Paystack redirects the owner's browser
//    back to us with a reference; anyone can type that URL. What settles it is
//    asking Paystack directly what happened to that reference, server to
//    server, which is what completeCheckout does before anything is recorded.
import { invoiceNumber, attemptReference, paidSubscriptionPatch, cardOf } from './billing.js';
import { planStanding, planDate } from '../shared/yoyo-plan.js';

/**
 * Start a payment.
 *
 * Creates (or reuses) the invoice first, then asks Paystack for a payment page.
 * Invoice first because it is the record: a payment page opened and abandoned
 * leaves an unpaid invoice, which is a question somebody can answer, while a
 * payment with no invoice is money arriving for no stated reason.
 *
 * @param {object} deps { getSubscription, getPlan, getGym, findOpenInvoice,
 *                        createInvoice, setInvoiceReference, verifyPayment,
 *                        markInvoicePaid, activateSubscription,
 *                        initializePayment, audit }
 */
export async function startCheckout(deps, { gymId, userId = null, source = 'account page', now = new Date() } = {}) {
  const subscription = await deps.getSubscription(gymId);
  if (!subscription) return { ok: false, reason: 'This gym has no subscription to pay for.' };

  // Nothing to pay yet: the month paid still has more than PAY_AHEAD_DAYS to
  // run. A second click never buys a second month by accident (CLAUDE.md §48).
  const standing = planStanding(subscription, now);
  if (!standing.canPay) {
    return {
      ok: false,
      reason: standing.paidUntil
        ? `Your plan is paid until ${planDate(standing.paidUntil)}.${
          standing.payableFrom ? ` The next month can be paid from ${planDate(standing.payableFrom)}.` : ''
        } Nothing has been charged.`
        : 'There is nothing to pay for this gym. Nothing has been charged.',
    };
  }

  const plan = subscription.plan_id ? await deps.getPlan(subscription.plan_id) : null;

  // RULE 1. The amount comes from the plan, never from the caller.
  const amountCents = plan?.price_cents;
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    // An unpriced plan is not free — nobody has decided what it costs yet.
    // Charging zero, or letting a browser suggest a number, are both wrong.
    return { ok: false, reason: 'This plan has no price set yet. Please contact us.' };
  }

  const gym = await deps.getGym(gymId);
  if (!gym?.owner_email) return { ok: false, reason: 'This gym has no owner email to bill.' };

  const periodEnd = subscription.current_period_end ?? subscription.trial_ends_at ?? null;

  // Reuse an invoice already open for this period rather than raising a second
  // one. An owner who opens the payment page twice owes one month, not two.
  let invoice = await deps.findOpenInvoice(gymId, periodEnd);

  if (invoice) {
    // The last attempt may have been PAID with nothing recorded — the page
    // closed before it came back, and the webhook lost. Paystack is asked
    // first; paying again would take the month twice (CLAUDE.md §49).
    const last = invoice.provider_ref ? await deps.verifyPayment(invoice.provider_ref).catch(() => null) : null;
    if (last?.status === 'success' && Number(last.amount) === Number(invoice.amount_cents)) {
      await settleInvoice(deps, invoice, last, invoice.provider_ref, now);
      return { ok: false, reason: 'This month is already paid — thank you. Nothing more has been charged.' };
    }
    // A new attempt, with its own reference: Paystack refuses one it has seen
    // before, so the owner who left the first page could never pay (§49).
    const reference = attemptReference(invoice.number, now);
    await deps.setInvoiceReference(invoice.id, reference);
    invoice = { ...invoice, provider_ref: reference };
  } else {
    const reference = invoiceNumber(Date.now() % 1_000_000, now);
    invoice = await deps.createInvoice({
      gym_id: gymId,
      subscription_id: subscription.id,
      number: reference,
      status: 'issued',
      amount_cents: amountCents,
      currency: plan.currency || 'ZAR',
      issued_at: now.toISOString(),
      due_at: now.toISOString(),
      provider: 'paystack',
      provider_ref: reference,
      period_end: periodEnd,
    });
  }

  // Paystack unreachable, refusing, or its key not set: said plainly, never a
  // crash. The invoice stays open and is reused on the next try.
  let payment;
  try {
    payment = await deps.initializePayment({
      email: gym.owner_email,
      amountCents: invoice.amount_cents,
      reference: invoice.provider_ref,
      metadata: { gym_id: gymId, invoice_id: invoice.id },
    });
  } catch (err) {
    console.error('[checkout] the payment page could not be opened:', String(err?.message || err).slice(0, 200));
    return { ok: false, reason: 'Card payments are not available right now. Nothing has been charged — please try again later.' };
  }

  if (!payment?.authorization_url) {
    return { ok: false, reason: 'We could not start the payment. Please try again.' };
  }

  await deps.audit({
    action: 'platform.checkout.started',
    actor_user_id: userId,
    entity: 'invoice',
    entity_id: invoice.id,
    detail: { gym_id: gymId, amount_cents: invoice.amount_cents, from: source },
  });

  return { ok: true, url: payment.authorization_url, invoice };
}

/**
 * Finish a payment, after Paystack sends the owner back.
 *
 * RULE 2 lives here. The reference in the URL is a claim made by whoever
 * opened the URL. Nothing is recorded until Paystack itself confirms, server
 * to server, that this reference was paid and for how much.
 */
export async function completeCheckout(deps, { reference, now = new Date() } = {}) {
  if (!reference) return { ok: false, reason: 'Nothing to confirm.' };

  const invoice = await deps.findInvoiceByRef(reference);
  if (!invoice) return { ok: false, reason: 'We could not find that payment.' };

  // Already settled — the webhook usually arrives before the browser does.
  // Acknowledged, not applied twice.
  if (invoice.status === 'paid') {
    if (!invoice.provider_ref || invoice.provider_ref === reference) return { ok: true, alreadyPaid: true, invoice };
    // Paid by ANOTHER attempt — was this one paid too? Then the owner paid
    // the month twice, and a person must refund one (§49).
    const second = await deps.verifyPayment(reference).catch(() => null);
    if (second?.status === 'success') {
      await deps.audit({
        action: 'platform.invoice.paid_twice',
        entity: 'invoice',
        entity_id: invoice.id,
        detail: { gym_id: invoice.gym_id, reference, paid_reference: invoice.provider_ref, amount_cents: second.amount ?? null },
      });
      return { ok: true, alreadyPaid: true, paidTwice: true, invoice };
    }
    return { ok: true, alreadyPaid: true, invoice };
  }

  const verified = await deps.verifyPayment(reference);

  if (verified?.status !== 'success') {
    await deps.audit({
      action: 'platform.checkout.not_successful',
      entity: 'invoice',
      entity_id: invoice.id,
      detail: { reference, reported: verified?.status ?? null },
    });
    return { ok: false, reason: 'That payment did not go through. Nothing has been charged.' };
  }

  // The amount Paystack says it took, against the amount we asked for. A
  // mismatch is not something to quietly accept in either direction.
  if (Number(verified.amount) !== Number(invoice.amount_cents)) {
    await deps.audit({
      action: 'platform.checkout.amount_mismatch',
      entity: 'invoice',
      entity_id: invoice.id,
      detail: { expected: invoice.amount_cents, received: verified.amount },
    });
    return { ok: false, reason: 'That payment did not match the invoice. Please contact us.' };
  }

  const recurring = await settleInvoice(deps, invoice, verified, reference, now);
  return { ok: true, invoice, recurring };
}

/**
 * Record a payment Paystack has CONFIRMED: the invoice paid (under the
 * reference that paid it), the subscription active for the month the invoice
 * bought, and the card kept for the next one.
 *
 * THE PART THAT MAKES IT A SUBSCRIPTION RATHER THAN ONE PAYMENT: Paystack
 * returns an authorization code after a card payment; stored, the nightly run
 * charges the same card next month without asking.
 *
 * The month starts where the time the invoice was raised against ends — paid
 * during the free trial, every free day is kept (CLAUDE.md §48.1 Q3). The
 * webhook records the same month from the same invoice, so whichever arrives
 * first, they agree. Returns whether renewals will work.
 */
async function settleInvoice(deps, invoice, verified, reference, now) {
  await deps.markInvoicePaid(invoice.id, now.toISOString(), reference);
  const card = cardOf(verified);
  await deps.activateSubscription(invoice.gym_id, paidSubscriptionPatch({ periodEnd: invoice.period_end, card, now }));
  await deps.audit({
    action: 'platform.checkout.paid',
    entity: 'invoice',
    entity_id: invoice.id,
    detail: {
      gym_id: invoice.gym_id,
      amount_cents: invoice.amount_cents,
      // Whether renewals will work, recorded at the moment it is decided.
      recurring_enabled: Boolean(card?.paystack_auth_code),
    },
  });
  return Boolean(card?.paystack_auth_code);
}
