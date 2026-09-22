// Entitlement tests — the gate that sits in front of the gym app's routes.
//
// THE MOST IMPORTANT TEST IN THIS FILE IS THE FIRST ONE.
//
// Every existing gym deployment runs with no platform, no plan and no resolved
// gym. Gating must be completely inert there: a single-gym deployment behaves
// exactly as it did before this code existed. If that breaks, working systems
// break, which is worse than any feature being wrongly free.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runWithGym } from '../server/lib/tenancy.js';
import { entitlementFor, allowsMemberRegistration } from '../server/lib/entitlements.js';

// ---------------------------------------------------------------------------
// Single-gym mode — the existing deployments
// ---------------------------------------------------------------------------

test('with NO resolved gym, every route is allowed — existing deployments are untouched', () => {
  for (const route of ['classes', 'face-descriptors', 'analytics', 'broadcast', 'audit', 'settings']) {
    assert.equal(entitlementFor(route).allowed, true, `single-gym must still reach ${route}`);
  }
});

test('with no resolved gym, member registration is never limited', () => {
  assert.equal(allowsMemberRegistration(99999).allowed, true);
});

// ---------------------------------------------------------------------------
// Platform mode — a gym with a plan
// ---------------------------------------------------------------------------

const gymOn = (features, extra = {}) => ({
  gym: { id: 'g1', slug: 'iron-works', ...extra },
  features,
  client: {},
});

test('a gym is allowed a route its plan includes', () => {
  runWithGym(gymOn(['members', 'checkin', 'classes']), () => {
    assert.equal(entitlementFor('classes').allowed, true);
    assert.equal(entitlementFor('members').allowed, true);
  });
});

test('a gym is blocked from a route its plan excludes, with 402', () => {
  runWithGym(gymOn(['members', 'checkin']), () => {
    const r = entitlementFor('face-descriptors');
    assert.equal(r.allowed, false);
    assert.equal(r.status, 402, 'billing state, not a permission error');
    assert.match(r.message, /upgrade/i);
  });
});

test('an unmapped route is refused even for a gym with every feature', () => {
  runWithGym(gymOn(['members', 'face', 'audit']), () => {
    const r = entitlementFor('route-that-does-not-exist');
    assert.equal(r.allowed, false);
    assert.equal(r.status, 404, 'unknown route is not-found, not a billing prompt');
  });
});

test('a gym with an empty feature list is blocked from everything mapped', () => {
  // A misconfigured plan must fail closed, not open.
  runWithGym(gymOn([]), () => {
    assert.equal(entitlementFor('members').allowed, false);
  });
});

test('a gym whose features are missing entirely fails CLOSED, not open', () => {
  // The dangerous shape: a resolved gym with no features field. It must not be
  // mistaken for single-gym mode, because that would hand a Basic gym the
  // entire system.
  runWithGym({ gym: { id: 'g1' }, client: {} }, () => {
    const r = entitlementFor('face-descriptors');
    assert.equal(r.allowed, false, 'a resolved gym with no plan gets nothing');
  });
});

// ---------------------------------------------------------------------------
// Member limits
// ---------------------------------------------------------------------------

test('a gym under its member limit may register', () => {
  runWithGym(gymOn(['members'], {}), () => {
    const r = allowsMemberRegistration(39, { maxActiveMembers: 40 });
    assert.equal(r.allowed, true);
  });
});

test('a gym at its limit is blocked, and told what it costs to grow', () => {
  runWithGym(gymOn(['members']), () => {
    const r = allowsMemberRegistration(40, { maxActiveMembers: 40 });
    assert.equal(r.allowed, false);
    assert.equal(r.status, 402);
    assert.match(r.message, /40/);
  });
});

test('a downgraded gym over its limit keeps its members', () => {
  runWithGym(gymOn(['members']), () => {
    const r = allowsMemberRegistration(200, { maxActiveMembers: 40 });
    assert.equal(r.allowed, false, 'no new registrations');
    assert.equal(r.existingMembersAffected, false, 'but nobody is cut off');
  });
});

test('a gym with a plan but no stated limit is not limited', () => {
  // Absence of a limit means unlimited, not zero. Defaulting to zero would lock
  // a gym out of its own system over a missing field.
  runWithGym(gymOn(['members']), () => {
    assert.equal(allowsMemberRegistration(5000, {}).allowed, true);
  });
});
