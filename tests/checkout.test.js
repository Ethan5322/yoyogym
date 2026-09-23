// A gym owner paying their subscription — the only money Yoyo Gyms handles.
//
// A member pays their own gym (cash at one, EFT at another) and that never
// touches the platform. This is the other payment: the owner paying us.
//
// Two rules carry the whole thing, and most of these tests are about them:
//   1. the amount comes from the PLAN, never from the request
//   2. the callback is NEVER believed — Paystack is asked directly
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startCheckout, completeCheckout } from '../platform/checkout.js';

const NOW = new Date('2026-09-22T12:00:00Z');
const PLAN = { id: 'p1', key: 'basic', price_cents: 49900, currency: 'ZAR' };
const SUB = {
  id: 's1', gym_id: 'g1', plan_id: 'p1', status: 'trialing',
  current_period_end: '2026-10-22T00:00:00Z',
};
const INVOICE = { id: 'inv1', gym_id: 'g1', amount_cents: 49900, provider_ref: 'YG-1', status: 'issued' };

function deps(over = {}) {
  const calls = { invoices: [], initialized: [], paid: [], activated: [], audits: [] };
  return {
    calls,
    getSubscription: async () => SUB,
    getPlan: async () => PLAN,
    getGym: async () => ({ id: 'g1', owner_email: 'ann@bos.co', search_name: 'BOS GYM' }),
    findOpenInvoice: async () => null,
    createInvoice: async (row) => { calls.invoices.push(row); return { ...row, id: 'inv1' }; },
    initializePayment: async (args) => {
      calls.initialized.push(args);
      return { authorization_url: 'https://checkout.paystack.com/abc123' };
    },
    findInvoiceByRef: async () => INVOICE,
    verifyPayment: async () => ({
      status: 'success',
      amount: 49900,
      customer: { customer_code: 'CUS_1' },
      authorization: { authorization_code: 'AUTH_abc', brand: 'visa', last4: '4242' },
    }),
    markInvoicePaid: async (id, at) => { calls.paid.push({ id, at }); },
    activateSubscription: async (gymId, patch) => { calls.activated.push({ gymId, ...patch }); },
    audit: async (a) => { calls.audits.push(a); },
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Rule 1 — the amount comes from the plan
// ---------------------------------------------------------------------------

test('THE AMOUNT COMES FROM THE PLAN, NOT THE REQUEST', async () => {
  // A price that arrives from a browser is a price the payer chose.
  const d = deps();
  await startCheckout(d, { gymId: 'g1', now: NOW });

  assert.equal(d.calls.initialized[0].amountCents, 49900);
  assert.equal(d.calls.invoices[0].amount_cents, 49900);
});

test('an unpriced plan cannot be paid for', async () => {
  const d = deps({ getPlan: async () => ({ ...PLAN, price_cents: null }) });
  const result = await startCheckout(d, { gymId: 'g1', now: NOW });

  assert.equal(result.ok, false);
  assert.match(result.reason, /no price set/i);
  assert.equal(d.calls.initialized.length, 0);
});

test('a gym with no subscription cannot start a payment', async () => {
  const d = deps({ getSubscription: async () => null });
  assert.equal((await startCheckout(d, { gymId: 'g1', now: NOW })).ok, false);
});

// ---------------------------------------------------------------------------
// The invoice
// ---------------------------------------------------------------------------

test('the invoice is raised BEFORE the payment page', async () => {
  // A page opened and abandoned leaves an unpaid invoice, which is a question
  // somebody can answer. A payment with no invoice is money with no reason.
  const d = deps();
  await startCheckout(d, { gymId: 'g1', now: NOW });

  assert.equal(d.calls.invoices.length, 1);
  assert.equal(d.calls.invoices[0].status, 'issued');
});

test('opening the payment page twice does not raise two invoices', async () => {
  // An owner who clicks twice owes one month, not two.
  const d = deps({ findOpenInvoice: async () => INVOICE });
  const result = await startCheckout(d, { gymId: 'g1', now: NOW });

  assert.equal(d.calls.invoices.length, 0);
  assert.equal(result.ok, true);
});

// ---------------------------------------------------------------------------
// Rule 2 — the callback is never believed
// ---------------------------------------------------------------------------

test('THE CALLBACK IS VERIFIED WITH PAYSTACK, NEVER TRUSTED', async () => {
  let asked = null;
  const d = deps({
    verifyPayment: async (ref) => {
      asked = ref;
      return { status: 'success', amount: 49900, authorization: {} };
    },
  });

  await completeCheckout(d, { reference: 'YG-1', now: NOW });
  assert.equal(asked, 'YG-1', 'Paystack is asked directly, server to server');
});

test('a callback for a payment that did not succeed records nothing', async () => {
  // Anyone can type the callback URL. Only Paystack settles it.
  const d = deps({ verifyPayment: async () => ({ status: 'abandoned' }) });
  const result = await completeCheckout(d, { reference: 'YG-1', now: NOW });

  assert.equal(result.ok, false);
  assert.equal(d.calls.paid.length, 0);
  assert.equal(d.calls.activated.length, 0);
});

test('AN AMOUNT THAT DISAGREES WITH THE INVOICE IS REFUSED', async () => {
  const d = deps({ verifyPayment: async () => ({ status: 'success', amount: 100, authorization: {} }) });
  const result = await completeCheckout(d, { reference: 'YG-1', now: NOW });

  assert.equal(result.ok, false);
  assert.equal(d.calls.paid.length, 0);
  assert.ok(d.calls.audits.some((a) => a.action === 'platform.checkout.amount_mismatch'));
});

test('an unknown reference is refused', async () => {
  const d = deps({ findInvoiceByRef: async () => null });
  assert.equal((await completeCheckout(d, { reference: 'made-up', now: NOW })).ok, false);
});

test('an already-paid invoice is acknowledged, not paid twice', async () => {
  // The webhook usually arrives before the browser does.
  const d = deps({ findInvoiceByRef: async () => ({ ...INVOICE, status: 'paid' }) });
  const result = await completeCheckout(d, { reference: 'YG-1', now: NOW });

  assert.equal(result.ok, true);
  assert.equal(result.alreadyPaid, true);
  assert.equal(d.calls.paid.length, 0);
});

// ---------------------------------------------------------------------------
// What makes it a SUBSCRIPTION and not one payment
// ---------------------------------------------------------------------------

test('THE AUTHORIZATION CODE IS STORED, OR THERE IS NO RECURRING BILLING', async () => {
  // Without this there is a first payment and then silence — which is exactly
  // what this system did before today.
  const d = deps();
  const result = await completeCheckout(d, { reference: 'YG-1', now: NOW });

  const patch = d.calls.activated[0];
  assert.equal(patch.paystack_auth_code, 'AUTH_abc');
  assert.equal(patch.status, 'active');
  assert.equal(result.recurring, true);
});

test('the card is remembered for display, not for charging', async () => {
  // "Visa ending 4242" on the screen. The brand and last four cannot charge
  // anything — only the authorization code can.
  const d = deps();
  await completeCheckout(d, { reference: 'YG-1', now: NOW });

  assert.equal(d.calls.activated[0].card_brand, 'visa');
  assert.equal(d.calls.activated[0].card_last4, '4242');
});

test('a payment with NO authorization code still succeeds, and says renewals will not work', async () => {
  // Some payment methods do not return one. The month is paid; the next one
  // will need asking again, and the audit log records which it was.
  const d = deps({ verifyPayment: async () => ({ status: 'success', amount: 49900, authorization: {} }) });
  const result = await completeCheckout(d, { reference: 'YG-1', now: NOW });

  assert.equal(result.ok, true);
  assert.equal(result.recurring, false);

  const entry = d.calls.audits.find((a) => a.action === 'platform.checkout.paid');
  assert.equal(entry.detail.recurring_enabled, false);
});

test('paying clears the grace window and sets a fresh period', async () => {
  const d = deps();
  await completeCheckout(d, { reference: 'YG-1', now: NOW });

  const patch = d.calls.activated[0];
  assert.equal(patch.grace_ends_at, null);
  assert.ok(new Date(patch.current_period_end) > NOW);
});
