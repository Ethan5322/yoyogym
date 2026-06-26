// Unit tests for the shared pricing logic (the money math that the chatbot and
// the authoritative /api/register both rely on). Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeMembership,
  monthlyForDuration,
  effectiveJoiningFee,
  addonsTotal,
  totalDueToday,
} from '../shared/pricing.js';

const fullPlan = {
  id: 'p1',
  name: 'Premium',
  tier: 'premium',
  visit_type: 'full',
  monthly_price: 800,
  joining_fee: 200,
};

test('monthlyForDuration applies the contract discount', () => {
  assert.equal(monthlyForDuration(fullPlan, 'month_to_month'), 800);
  assert.equal(monthlyForDuration(fullPlan, '6_month'), 760); // 5% off
  assert.equal(monthlyForDuration(fullPlan, '12_month'), 720); // 10% off
});

test('effectiveJoiningFee honours a promo override', () => {
  assert.equal(effectiveJoiningFee(fullPlan), 200);
  assert.equal(effectiveJoiningFee({ ...fullPlan, promo_joining_fee: 0 }), 0);
  assert.equal(effectiveJoiningFee({ ...fullPlan, promo_joining_fee: 99 }), 99);
});

test('computeMembership (full) = joining + first month, with contract value', () => {
  const m = computeMembership(fullPlan, '12_month');
  assert.equal(m.visit_type, 'full');
  assert.equal(m.monthly_amount, 720);
  assert.equal(m.joining_fee, 200);
  assert.equal(m.amount_today, 920); // 200 + 720
  assert.equal(m.contract_value, 8640); // 12 * 720
});

test('computeMembership (session pack / day pass / trial)', () => {
  assert.equal(computeMembership({ visit_type: 'session_pack', session_pack_price: 600, session_pack_size: 10 }).amount_today, 600);
  assert.equal(computeMembership({ visit_type: 'day_pass', day_pass_price: 80 }).amount_today, 80);
  assert.equal(computeMembership({ visit_type: 'trial', trial_price: 99 }).amount_today, 99);
});

test('addonsTotal and totalDueToday sum correctly', () => {
  const addons = [{ price: 250 }, { price: 99 }];
  assert.equal(addonsTotal(addons), 349);
  const m = computeMembership(fullPlan, 'month_to_month');
  assert.equal(totalDueToday(m, addons), 1000 + 349); // (200+800) + 349
});
