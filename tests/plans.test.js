// Plan and gating tests, written before the gating.
//
// What these defend:
//   - a gym cannot reach a feature it is not paying for
//   - a gym cannot exceed its member limit
//   - a DOWNGRADE never destroys anything — existing members keep working
//   - the plan comes from the server, never from the client
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLANS,
  planByKey,
  hasFeature,
  featureForRoute,
  checkRoute,
  checkMemberLimit,
  ownerFacingPlan,
} from '../platform/plans.js';

// ---------------------------------------------------------------------------
// The plans themselves
// ---------------------------------------------------------------------------

test('there are exactly three plans, and Prime has everything', () => {
  assert.deepEqual(PLANS.map((p) => p.key), ['basic', 'medium', 'prime']);

  const everyFeature = new Set(PLANS.flatMap((p) => p.features));
  const prime = planByKey('prime');
  for (const feature of everyFeature) {
    assert.ok(prime.features.includes(feature), `Prime must include ${feature}`);
  }
});

test('the tiers nest — anything Basic has, Medium and Prime have', () => {
  const basic = planByKey('basic');
  const medium = planByKey('medium');
  const prime = planByKey('prime');

  for (const f of basic.features) {
    assert.ok(medium.features.includes(f), `Medium must include Basic's ${f}`);
    assert.ok(prime.features.includes(f), `Prime must include Basic's ${f}`);
  }
  for (const f of medium.features) {
    assert.ok(prime.features.includes(f), `Prime must include Medium's ${f}`);
  }
});

test('member limits rise with the tier', () => {
  assert.equal(planByKey('basic').maxActiveMembers, 40);
  assert.equal(planByKey('medium').maxActiveMembers, 150);
  assert.equal(planByKey('prime').maxActiveMembers, 500);
});

test('every tier can run a gym — core operation is never gated', () => {
  // Crippling registration, check-in or payments would make bad software, not
  // upgrades. Each of these must be in the smallest plan.
  const basic = planByKey('basic');
  for (const core of ['members', 'checkin', 'payments', 'catalog', 'settings', 'staff', 'qr']) {
    assert.ok(hasFeature(basic, core), `Basic must include core feature: ${core}`);
  }
});

test('face recognition is Prime only — it is the flagship', () => {
  assert.equal(hasFeature(planByKey('basic'), 'face'), false);
  assert.equal(hasFeature(planByKey('medium'), 'face'), false);
  assert.equal(hasFeature(planByKey('prime'), 'face'), true);
});

// ---------------------------------------------------------------------------
// Route gating — enforced in the routers, not in 76 handlers
// ---------------------------------------------------------------------------

test('every admin route maps to a feature — none is left ungated by omission', () => {
  const routes = [
    'dashboard', 'verify', 'members', 'member', 'member-action', 'today', 'classes',
    'class-bookings', 'trainers', 'payments', 'analytics', 'broadcast', 'plans', 'addons',
    'settings', 'qr-stats', 'events', 'clients', 'training-session', 'face-descriptors',
    'access-card', 'access-action', 'attendance-live', 'attendance-report', 'visitor',
    'incident', 'resolve-member', 'enroll-face', 'staff', 'profile', 'audit', 'finance',
    'notifications', 'inbox', 'message', 'members-import', 'announcements',
  ];
  for (const route of routes) {
    assert.ok(featureForRoute(route), `route "${route}" has no feature mapping`);
  }
});

test('an unknown route is refused rather than allowed by default', () => {
  // Fail closed: a new route with no mapping must not be silently public.
  assert.equal(featureForRoute('some-new-route'), null);
  assert.equal(checkRoute(planByKey('prime'), 'some-new-route').allowed, false);
});

test('a Basic gym is blocked from classes, and told what unlocks it', () => {
  const r = checkRoute(planByKey('basic'), 'classes');

  assert.equal(r.allowed, false);
  assert.equal(r.status, 402, 'a billing state, not a permission error');
  assert.equal(r.requiredPlan, 'medium', 'the message names the cheapest plan that includes it');
  assert.match(r.message, /Medium/i);
});

test('a Basic gym is blocked from the face scanner, pointed at Prime', () => {
  const r = checkRoute(planByKey('basic'), 'face-descriptors');
  assert.equal(r.allowed, false);
  assert.equal(r.requiredPlan, 'prime');
});

test('a Medium gym reaches classes but not the face scanner', () => {
  assert.equal(checkRoute(planByKey('medium'), 'classes').allowed, true);
  assert.equal(checkRoute(planByKey('medium'), 'face-descriptors').allowed, false);
});

test('a Prime gym reaches everything mapped', () => {
  for (const route of ['classes', 'face-descriptors', 'analytics', 'broadcast', 'audit', 'visitor']) {
    assert.equal(checkRoute(planByKey('prime'), route).allowed, true, route);
  }
});

// ---------------------------------------------------------------------------
// Member limits
// ---------------------------------------------------------------------------

test('a gym under its limit can register members', () => {
  const r = checkMemberLimit(planByKey('basic'), 39);
  assert.equal(r.allowed, true);
  assert.equal(r.remaining, 1);
});

test('a gym AT its limit is blocked, with the upgrade named', () => {
  const r = checkMemberLimit(planByKey('basic'), 40);

  assert.equal(r.allowed, false);
  assert.equal(r.status, 402);
  assert.match(r.message, /40/);
  assert.equal(r.suggestedPlan, 'medium');
});

test('a DOWNGRADED gym over its limit keeps its members — only new ones stop', () => {
  // The gym had 200 members on Medium and dropped to Basic. Nothing is deleted;
  // it simply cannot add a 201st.
  const r = checkMemberLimit(planByKey('basic'), 200);

  assert.equal(r.allowed, false, 'no new registrations');
  assert.equal(r.overLimitBy, 160);
  assert.equal(r.existingMembersAffected, false, 'existing members are NEVER cut off');
});

test('Prime is limited too — a limit nobody enforces is not a limit', () => {
  assert.equal(checkMemberLimit(planByKey('prime'), 499).allowed, true);
  assert.equal(checkMemberLimit(planByKey('prime'), 500).allowed, false);
  assert.equal(checkMemberLimit(planByKey('prime'), 500).suggestedPlan, null, 'nothing above Prime to suggest');
});

// ---------------------------------------------------------------------------
// What the gym owner is shown when choosing
// ---------------------------------------------------------------------------

test('each plan can describe itself to a gym owner in their terms', () => {
  for (const plan of PLANS) {
    const shown = ownerFacingPlan(plan);

    assert.ok(shown.label);
    assert.ok(shown.memberLimit, 'how many members they can have');
    assert.ok(shown.included.length > 0, 'what they get');
    assert.ok(shown.memberBenefits.length > 0, 'what THEIR MEMBERS can do — the thing owners care about');
    assert.equal(shown.price, null, 'price is data, set later, never hard-coded');
  }
});

test('the owner is told what the NEXT plan adds, so upgrading is legible', () => {
  const basic = ownerFacingPlan(planByKey('basic'));
  assert.ok(basic.nextPlanAdds.length > 0);
  assert.equal(ownerFacingPlan(planByKey('prime')).nextPlanAdds.length, 0, 'nothing above Prime');
});
