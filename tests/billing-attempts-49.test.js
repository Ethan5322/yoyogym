// CLAUDE.md §49: a payment page opened and left. Before, the unpaid invoice it
// left behind made the nightly run skip that gym for ever (never charged,
// never overdue, never suspended), and a second Pay now reused a reference
// Paystack had already seen — which Paystack refuses — so that month could
// never be paid. Now every attempt has its own reference, Paystack is asked
// before anything is tried again, and a month is never taken twice unseen.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-only-service-key';
process.env.PLATFORM_JWT_SECRET ||= 'test-only-signing-key-not-used-anywhere';

const { attemptReference, invoiceNumberOf, staleInvoice, RETRY_AFTER_HOURS } = await import('../platform/billing.js');
const { startCheckout, completeCheckout } = await import('../platform/checkout.js');
const { runBilling } = await import('../platform/billing-runner.js');
const { platformOpsDeps } = await import('../platform/deps.js');
const { paymentResultPage } = await import('../platform/views.js');
const { fakeDb } = await import('./fake-db.js');

const NOW = new Date('2026-11-01T06:00:00Z');
const HOUR = 3_600_000;
const PLAN = { id: 'p1', key: 'medium', price_cents: 99900, currency: 'ZAR' };

// ---------------------------------------------------------------------------
// References
// ---------------------------------------------------------------------------

test('each attempt has its own reference, and every one leads back to its invoice', () => {
  const ref = attemptReference('YG-2026-000123', NOW);
  assert.match(ref, /^YG-2026-000123-[0-9A-Z]+$/);
  assert.match(ref, /^[A-Za-z0-9.=-]+$/, 'only the characters Paystack allows');
  assert.notEqual(ref, attemptReference('YG-2026-000123', new Date(NOW.getTime() + 1)));
  assert.equal(invoiceNumberOf(ref), 'YG-2026-000123');
  assert.equal(invoiceNumberOf('YG-2026-000123'), 'YG-2026-000123');
  assert.equal(invoiceNumberOf('nonsense'), null);
});

test('an unpaid invoice is tried again only once it is old enough', () => {
  assert.equal(RETRY_AFTER_HOURS, 12);
  assert.equal(staleInvoice({ issued_at: new Date(NOW.getTime() - 13 * HOUR).toISOString() }, NOW), true);
  assert.equal(staleInvoice({ issued_at: new Date(NOW.getTime() - 2 * HOUR).toISOString() }, NOW), false);
  assert.equal(staleInvoice({}, NOW), false, 'no date: left alone, as before');
});

// ---------------------------------------------------------------------------
// Pay now, again
// ---------------------------------------------------------------------------

const TRIAL = { id: 's1', gym_id: 'g1', plan_id: 'p1', status: 'trialing', created_at: '2026-10-01T00:00:00Z', trial_ends_at: '2026-10-31T00:00:00Z', current_period_end: '2026-10-31T00:00:00Z' };
const OPEN = { id: 'inv1', gym_id: 'g1', number: 'YG-2026-000123', provider_ref: 'YG-2026-000123', status: 'issued', amount_cents: 99900, period_end: '2026-10-31T00:00:00Z' };

function checkoutDeps(over = {}) {
  const calls = { refs: [], paid: [], activated: [], initialized: [], audits: [] };
  return {
    calls,
    getSubscription: async () => TRIAL,
    getPlan: async () => PLAN,
    getGym: async () => ({ id: 'g1', slug: 'cocate-gym', owner_email: 'owner@cocate.co' }),
    findOpenInvoice: async () => OPEN,
    createInvoice: async () => { throw new Error('no second invoice'); },
    setInvoiceReference: async (id, ref) => { calls.refs.push(ref); },
    verifyPayment: async () => ({ status: 'abandoned' }),
    markInvoicePaid: async (id, at, ref) => { calls.paid.push({ id, ref }); },
    activateSubscription: async (gymId, patch) => { calls.activated.push(patch); },
    initializePayment: async (a) => { calls.initialized.push(a); return { authorization_url: 'https://checkout.paystack.com/new' }; },
    findInvoiceByRef: async () => OPEN,
    audit: async (a) => { calls.audits.push(a); },
    ...over,
  };
}

test('Pay now after leaving a page opens a NEW attempt on the same invoice', async () => {
  const d = checkoutDeps();
  const r = await startCheckout(d, { gymId: 'g1', now: new Date('2026-10-20T00:00:00Z') });
  assert.equal(r.ok, true);
  assert.equal(d.calls.refs.length, 1);
  assert.equal(d.calls.initialized[0].reference, d.calls.refs[0]);
  assert.notEqual(d.calls.initialized[0].reference, OPEN.provider_ref, 'Paystack refuses a reference it has seen');
});

test('Pay now when the last attempt WAS paid records it and charges nothing more', async () => {
  const d = checkoutDeps({ verifyPayment: async () => ({ status: 'success', amount: 99900, authorization: { authorization_code: 'AUTH_1', last4: '4081', brand: 'visa' } }) });
  const r = await startCheckout(d, { gymId: 'g1', now: new Date('2026-10-20T00:00:00Z') });
  assert.equal(r.ok, false);
  assert.match(r.reason, /already paid/);
  assert.equal(d.calls.initialized.length, 0, 'no second payment page');
  assert.deepEqual(d.calls.paid[0], { id: 'inv1', ref: 'YG-2026-000123' });
  assert.equal(d.calls.activated[0].current_period_start, '2026-10-31T00:00:00.000Z', 'the month after the trial (§48.1 Q3)');
  assert.equal(d.calls.activated[0].paystack_auth_code, 'AUTH_1');
});

test('returning from an EARLIER attempt still pays the invoice, under the reference that paid', async () => {
  const earlier = 'YG-2026-000123';
  const d = checkoutDeps({
    findInvoiceByRef: async () => ({ ...OPEN, provider_ref: 'YG-2026-000123-LATER' }),
    verifyPayment: async () => ({ status: 'success', amount: 99900, authorization: {} }),
  });
  const r = await completeCheckout(d, { reference: earlier, now: NOW });
  assert.equal(r.ok, true);
  assert.deepEqual(d.calls.paid[0], { id: 'inv1', ref: earlier });
});

test('a month paid on two attempts is flagged for a refund, and not added twice', async () => {
  const d = checkoutDeps({
    findInvoiceByRef: async () => ({ ...OPEN, status: 'paid', provider_ref: 'YG-2026-000123-FIRST' }),
    verifyPayment: async () => ({ status: 'success', amount: 99900 }),
  });
  const r = await completeCheckout(d, { reference: 'YG-2026-000123-SECOND', now: NOW });
  assert.equal(r.paidTwice, true);
  assert.equal(d.calls.activated.length, 0);
  assert.equal(d.calls.audits[0].action, 'platform.invoice.paid_twice');

  // The same attempt coming back is only a repeat — no flag.
  const again = await completeCheckout(d, { reference: 'YG-2026-000123-FIRST', now: NOW });
  assert.equal(again.alreadyPaid, true);
  assert.equal(again.paidTwice, undefined);

  assert.match(paymentResultPage({ ok: true, alreadyPaid: true, paidTwice: true, gymSlug: 'cocate-gym' }), /paid this month twice[\s\S]*contact you to return it/);
});

// ---------------------------------------------------------------------------
// The webhook
// ---------------------------------------------------------------------------

function webhookDb(invoice) {
  return fakeDb({
    platform_invoices: [{ ...OPEN, ...invoice }],
    platform_subscriptions: [{ id: 's1', gym_id: 'g1', status: 'trialing', trial_ends_at: '2099-01-01T00:00:00.000Z', current_period_end: '2099-01-01T00:00:00.000Z' }],
    gyms: [{ id: 'g1', status: 'active' }],
    platform_audit_log: [],
  });
}

test('the webhook finds an invoice by an EARLIER attempt\'s reference', async () => {
  const db = webhookDb({ provider_ref: 'YG-2026-000123-LATER', period_end: '2099-01-01T00:00:00.000Z' });
  const r = await platformOpsDeps(db).applyPaystackEvent({ kind: 'payment_succeeded', reference: 'YG-2026-000123', amount_cents: 99900, card: null });
  assert.equal(r.ok, true);
  assert.equal(db.tables.platform_invoices[0].status, 'paid');
  assert.equal(db.tables.platform_invoices[0].provider_ref, 'YG-2026-000123', 'kept as the reference that paid');
  assert.equal(db.tables.platform_subscriptions[0].current_period_start, '2099-01-01T00:00:00.000Z');
});

test('the webhook flags a second payment on a paid month — and changes nothing', async () => {
  const db = webhookDb({ status: 'paid', provider_ref: 'YG-2026-000123-FIRST' });
  const before = { ...db.tables.platform_subscriptions[0] };
  const r = await platformOpsDeps(db).applyPaystackEvent({ kind: 'payment_succeeded', reference: 'YG-2026-000123-SECOND', amount_cents: 99900 });
  assert.equal(r.paidTwice, true);
  assert.deepEqual(db.tables.platform_subscriptions[0], before);
  assert.ok(db.tables.platform_audit_log.some((e) => e.action === 'platform.invoice.paid_twice'));

  const repeat = await platformOpsDeps(db).applyPaystackEvent({ kind: 'payment_succeeded', reference: 'YG-2026-000123-FIRST', amount_cents: 99900 });
  assert.equal(repeat.duplicate, true, 'Paystack repeating itself is not a second payment');
});

// ---------------------------------------------------------------------------
// The nightly run
// ---------------------------------------------------------------------------

/** The trial ended yesterday; an owner opened Pay now days ago and left. */
const ENDED = { id: 's1', gym_id: 'g1', plan_id: 'p1', status: 'trialing', trial_ends_at: '2026-10-31T00:00:00Z', current_period_end: '2026-10-31T00:00:00Z' };
const LEFT = { ...OPEN, issued_at: '2026-10-25T00:00:00Z', period_end: '2026-10-31T00:00:00Z' };

function runnerDeps(over = {}) {
  const calls = { charges: [], subs: [], invoices: [], notices: [], audits: [], gyms: [] };
  return {
    calls,
    listActiveSubscriptions: async () => [ENDED],
    getPlan: async () => PLAN,
    getGym: async () => ({ id: 'g1', owner_email: 'owner@cocate.co' }),
    findInvoiceForPeriod: async () => LEFT,
    createInvoice: async () => { throw new Error('one invoice per period'); },
    updateInvoice: async (id, patch) => { calls.invoices.push({ id, ...patch }); },
    verifyPayment: async () => ({ status: 'abandoned' }),
    charge: async (a) => { calls.charges.push(a); return a.authorizationCode ? { ok: true } : { ok: false, reason: 'No saved card.' }; },
    updateSubscription: async (id, patch) => { calls.subs.push(patch); },
    setGymStatus: async (gymId, status) => { calls.gyms.push(status); },
    notify: async (n) => { calls.notices.push(n); },
    audit: async (a) => { calls.audits.push(a); },
    ...over,
  };
}

test('THE GAP: a page left days ago no longer keeps a gym free for ever', async () => {
  const d = runnerDeps();
  await runBilling(d, { now: NOW, dryRun: false });
  // Tried again on the SAME invoice, under a new reference; no card, so the
  // gym is now overdue, with its two days' grace and an email.
  assert.equal(d.calls.charges.length, 1);
  assert.match(d.calls.charges[0].reference, /^YG-2026-000123-[0-9A-Z]+$/);
  assert.equal(d.calls.invoices[0].provider_ref, d.calls.charges[0].reference, 'the reference is on the invoice before the charge');
  assert.equal(d.calls.subs.at(-1).status, 'past_due');
  assert.ok(d.calls.subs.at(-1).grace_ends_at);
  assert.equal(d.calls.invoices.at(-1).status, 'overdue');
  assert.equal(d.calls.notices[0].kind, 'payment_failed');
});

test('a saved card is charged on the left invoice — at the price it was raised at', async () => {
  const d = runnerDeps({ listActiveSubscriptions: async () => [{ ...ENDED, status: 'active', paystack_auth_code: 'AUTH_1' }] });
  const report = await runBilling(d, { now: NOW, dryRun: false });
  assert.equal(report.charged, 1);
  assert.equal(d.calls.charges[0].amountCents, 99900);
  assert.equal(d.calls.subs.at(-1).status, 'active');
});

test('a left page that WAS paid is recorded, never charged again', async () => {
  const d = runnerDeps({ verifyPayment: async () => ({ status: 'success', amount: 99900, authorization: { authorization_code: 'AUTH_9', last4: '4081', brand: 'visa' } }) });
  const report = await runBilling(d, { now: NOW, dryRun: false });
  assert.equal(d.calls.charges.length, 0);
  assert.equal(report.recovered, 1);
  assert.equal(d.calls.invoices[0].status, 'paid');
  assert.equal(d.calls.subs[0].status, 'active');
  assert.equal(d.calls.subs[0].paystack_auth_code, 'AUTH_9');
  assert.ok(d.calls.audits.some((a) => a.action === 'platform.invoice.recovered'));
});

test('an invoice raised hours ago is left alone — a run twice in a day never charges twice', async () => {
  const d = runnerDeps({ findInvoiceForPeriod: async () => ({ ...LEFT, issued_at: new Date(NOW.getTime() - 2 * HOUR).toISOString() }) });
  await runBilling(d, { now: NOW, dryRun: false });
  assert.equal(d.calls.charges.length, 0);
  assert.equal(d.calls.subs.length, 0);
});

test('a paid invoice whose month never reached the subscription is recorded, not charged', async () => {
  const d = runnerDeps({ findInvoiceForPeriod: async () => ({ ...LEFT, status: 'paid', paid_at: '2026-10-20T00:00:00Z' }) });
  const report = await runBilling(d, { now: NOW, dryRun: false });
  assert.equal(d.calls.charges.length, 0);
  assert.equal(report.recovered, 1);
  assert.equal(d.calls.subs[0].current_period_start, '2026-10-31T00:00:00.000Z', 'paid during the trial: the month after it');
});

test('a dry run says it would try again, and touches nothing', async () => {
  const d = runnerDeps();
  const report = await runBilling(d, { now: NOW, dryRun: true });
  assert.equal(report.planned.charge, 1);
  assert.equal(d.calls.charges.length + d.calls.subs.length + d.calls.invoices.length, 0);
});
