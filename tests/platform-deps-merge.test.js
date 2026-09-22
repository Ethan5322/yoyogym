// The merged dependency object.
//
// api/platform/[...path].js spreads three factories into one object. Spread
// order silently decides which definition wins, and the loser vanishes with no
// error — which already happened once: activationDeps() defined its own
// setGymStatus and clobbered the ops version that records a suspension reason
// and brings the subscription back in step.
//
// This test exists so the next collision is a red test rather than a missing
// audit trail discovered months later.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-only-service-key';

const { platformDeps, platformOpsDeps, activationDeps, ownerDeps, platformControlDeps } = await import('../platform/deps.js');

/** The one key all three share on purpose: the same audit writer. */
const INTENTIONAL = new Set(['audit']);

test('no dependency factory silently overwrites another', () => {
  const sets = [platformDeps(), platformOpsDeps(), activationDeps(), ownerDeps(), platformControlDeps()].map(Object.keys);
  const seen = new Map();

  for (const [i, keys] of sets.entries()) {
    for (const key of keys) {
      if (seen.has(key) && !INTENTIONAL.has(key)) {
        assert.fail(
          `"${key}" is defined by factory ${seen.get(key)} and factory ${i}. ` +
            'One of them wins by spread order and the other disappears without an error. ' +
            'Remove the duplicate, or add it to INTENTIONAL if the factories agree.'
        );
      }
      seen.set(key, i);
    }
  }
});

test('the router gets every dependency its routes call for', () => {
  const merged = { ...platformDeps(), ...platformOpsDeps(), ...activationDeps(), ...ownerDeps(), ...platformControlDeps() };

  // Each of these is called by a route. A missing one is a 500 on a path no
  // test happens to cover.
  for (const name of [
    'findUserByEmail', 'verifyPassword', 'verifySecondFactor', 'finishSetup',
    'listApplications', 'getApplicationView', 'decide',
    'createApplication', 'searchGyms',
    'permissionsFor', 'listGyms', 'getGymDetail', 'setGymStatus',
    'applyPaystackEvent', 'runBilling', 'reconcile',
    'activationContext', 'findActivation', 'setPassword', 'markUsed', 'issueActivation',
    'audit',
    'ownerDashboard', 'findOwnApplication', 'createSignedUpload', 'recordDocument',
    'getDocument', 'reviewDocument', 'signedDocumentUrl',
    'documentFacts', 'findDuplicateDocuments', 'getApplicationSummary',
    'listPlans', 'updatePlan', 'changeGymPlan', 'findGymsForMember', 'indexMember', 'gymStatsFor', 'listAuditLog', 'listOwners', 'setOwnerActive', 'financeSummary',
  ]) {
    assert.equal(typeof merged[name], 'function', `missing dependency: ${name}`);
  }
});
