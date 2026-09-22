// The billing cron's tests.
//
// billing.js decides; this runs. The decisions are already proven, so these
// tests are about the things that go wrong when a decision meets the world:
// running twice, one gym breaking the loop, and a dry run that charges anyway.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runBilling } from '../platform/billing-runner.js';

const T0 = new Date('2026-03-01T00:00:00Z');
const PLAN = { id: 'p1', key: 'basic', label: 'Basic', price_cents: 49900, currency: 'ZAR' };

/** A subscription whose period ended yesterday — money is due. */
const due = (over = {}) => ({
  id: 's1',
  gym_id: 'g1',
  plan_id: 'p1',
  status: 'active',
  current_period_end: '2026-02-28T00:00:00Z',
  ...over,
});

function deps(over = {}) {
  const calls = { charges: [], subs: [], gyms: [], invoices: [], notices: [], audits: [] };
  return {
    calls,
    listActiveSubscriptions: async () => [due()],
    getPlan: async () => PLAN,
    getGym: async () => ({ id: 'g1', slug: 'bos-gym', owner_email: 'owner@bos.co', search_name: 'BOS GYM' }),
    findInvoiceForPeriod: async () => null,
    createInvoice: async (row) => { calls.invoices.push(row); return { ...row, id: 'inv1' }; },
    updateInvoice: async (id, patch) => { calls.invoices.push({ id, ...patch }); },
    charge: async (args) => { calls.charges.push(args); return { ok: true, reference: args.reference }; },
    updateSubscription: async (id, patch) => { calls.subs.push({ id, ...patch }); },
    setGymStatus: async (gymId, status) => { calls.gyms.push({ gymId, status }); },
    notify: async (n) => { calls.notices.push(n); },
    audit: async (a) => { calls.audits.push(a); },
    ...over,
  };
}

// ---------------------------------------------------------------------------
// The dry run
// ---------------------------------------------------------------------------

test('a dry run moves no money at all', async () => {
  const d = deps();
  const report = await runBilling(d, { now: T0, dryRun: true });

  assert.equal(d.calls.charges.length, 0, 'a dry run that charges is not a dry run');
  assert.equal(d.calls.subs.length, 0, 'nor may it write');
  assert.equal(d.calls.gyms.length, 0);
  assert.equal(report.dryRun, true);
  assert.equal(report.planned.charge, 1, 'but it still says what it WOULD do');
});

test('a live run charges', async () => {
  const d = deps();
  await runBilling(d, { now: T0, dryRun: false });

  assert.equal(d.calls.charges.length, 1);
  assert.equal(d.calls.charges[0].amountCents, 49900, 'cents, taken straight from the plan');
});

// ---------------------------------------------------------------------------
// Running twice
// ---------------------------------------------------------------------------

test('a cron that fires twice in a day does not charge twice', async () => {
  // Vercel retries. A person clicks the button. Either way the invoice for a
  // period already exists, and that is what makes the second run a no-op.
  const d = deps({ findInvoiceForPeriod: async () => ({ id: 'inv1', status: 'issued' }) });
  await runBilling(d, { now: T0, dryRun: false });

  assert.equal(d.calls.charges.length, 0);
});

// ---------------------------------------------------------------------------
// One bad gym
// ---------------------------------------------------------------------------

test('one gym throwing does not stop the others being billed', async () => {
  const subs = [due({ id: 's1', gym_id: 'g1' }), due({ id: 's2', gym_id: 'g2' })];
  const d = deps({
    listActiveSubscriptions: async () => subs,
    charge: async (args) => {
      if (args.gymId === 'g1') throw new Error('Paystack timed out');
      return { ok: true, reference: args.reference };
    },
  });

  const report = await runBilling(d, { now: T0, dryRun: false });

  assert.equal(report.errors.length, 1);
  assert.equal(report.charged, 1, 'g2 was still billed');
});

// ---------------------------------------------------------------------------
// A failed payment
// ---------------------------------------------------------------------------

test('a declined card sets past_due and does NOT suspend the gym', async () => {
  const d = deps({ charge: async () => ({ ok: false, reason: 'insufficient funds' }) });
  await runBilling(d, { now: T0, dryRun: false });

  assert.equal(d.calls.subs[0].status, 'past_due');
  assert.equal(d.calls.gyms.length, 0, 'a decline is not a suspension');
  assert.ok(d.calls.notices.some((n) => n.kind === 'payment_failed'));
});

test('a closed grace window suspends the gym itself, not only the subscription', async () => {
  // Writing 'suspended' on the subscription while the gym keeps serving would
  // be a billing system that bills nobody and stops nothing.
  const d = deps({
    listActiveSubscriptions: async () => [
      due({ status: 'past_due', grace_ends_at: '2026-02-20T00:00:00Z' }),
    ],
  });
  await runBilling(d, { now: T0, dryRun: false });

  assert.equal(d.calls.subs[0].status, 'suspended');
  assert.deepEqual(d.calls.gyms[0], { gymId: 'g1', status: 'suspended' });
});

// ---------------------------------------------------------------------------
// Things the runner must never do
// ---------------------------------------------------------------------------

test('a gym suspended past the retention window is reported, never deleted', async () => {
  const d = deps({
    listActiveSubscriptions: async () => [
      due({ status: 'suspended', suspended_at: '2025-01-01T00:00:00Z' }),
    ],
  });
  const report = await runBilling(d, { now: T0, dryRun: false });

  assert.equal(report.purgeEligible.length, 1);
  assert.equal(d.calls.gyms.length, 0);
  assert.ok(!('deleteGym' in d), 'the runner is not even given a way to delete');
});

test('an unpriced plan is skipped, not charged zero', async () => {
  const d = deps({ getPlan: async () => ({ ...PLAN, price_cents: null }) });
  const report = await runBilling(d, { now: T0, dryRun: false });

  assert.equal(d.calls.charges.length, 0);
  assert.equal(report.skipped, 1);
});

test('the trial warning is sent once the trial is nearly over', async () => {
  const d = deps({
    listActiveSubscriptions: async () => [
      due({ status: 'trialing', current_period_end: '2026-03-02T00:00:00Z' }),
    ],
  });
  await runBilling(d, { now: T0, dryRun: false });

  assert.ok(d.calls.notices.some((n) => n.kind === 'trial_ending'));
  assert.equal(d.calls.charges.length, 0);
});
