// A failed gym build: its real reason reported, and a way to finish it.
//
// The first live gym (COCATE GYM, 2026-09-29) was approved, its schema built,
// and then the gym row was refused by the database. The refusal was thrown
// away — the next step crashed on "Cannot read properties of null" — and an
// approved application can never be approved again, so the gym was stuck and
// its owner told "Invalid username or password" everywhere.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.PLATFORM_JWT_SECRET ||= 'test-only-platform-secret-distinct';
process.env.JWT_SECRET ||= 'test-only-gym-secret';

import { fakeDb } from './fake-db.js';
import { retryProvisioning, approveApplication } from '../platform/applications.js';
import { provisioningDeps } from '../platform/deps.js';
import { applicationDetailPage } from '../platform/views.js';
import { handlePlatform } from '../platform/router.js';
import { sessionCookie, issueCsrfToken } from '../platform/http.js';

const reviewer = { id: 'staff-1', permissions: ['application.approve'] };
const APPROVED = { id: 'app-1', status: 'approved', slug: 'cocate-gym', proposed_gym_name: 'COCATE GYM', applicant_user_id: 'owner-1', requested_plan_key: 'basic' };

function deps({ application = { ...APPROVED }, last = { event: 'provision_failed', detail: { failed_at: 'saveConnection' } }, build = { ok: true, gym: { id: 'gym-1' } } } = {}) {
  const events = [];
  const built = [];
  const invited = [];
  return {
    events, built, invited,
    getApplication: async () => application,
    lastProvisionEvent: async () => last,
    appendEvent: async (e) => { events.push(e); return e; },
    provisionGym: async (app, opts) => { built.push({ app: app.id, opts }); return build; },
    issueActivation: async (a) => { invited.push(a); return { emailed: true }; },
    canReachProject: async () => ({ ok: true }),
    audit: async () => {},
  };
}

// ---------------------------------------------------------------------------
// The database's real reason is never thrown away again
// ---------------------------------------------------------------------------

function refusingDb(message) {
  const chain = {
    select() { return chain; }, eq() { return chain; },
    maybeSingle: async () => ({ data: null, error: null }),
    insert() { return { select: () => ({ single: async () => ({ data: null, error: { message } }) }) }; },
  };
  return { from: () => chain };
}

test('a refused gym row says WHY, instead of null and a crash one step later', async () => {
  const d = provisioningDeps(refusingDb('null value in column "owner_user_id" violates not-null constraint'));
  await assert.rejects(
    () => d.saveGym({ slug: 'cocate-gym', application_id: 'app-1' }),
    /Could not save the gym: null value in column "owner_user_id"/
  );
  await assert.rejects(() => d.saveConnection({ gym_id: 'gym-1' }), /Could not save the gym's connection/);
});

test('every building step can run again: what an earlier attempt saved is reused, not made twice', async () => {
  const db = fakeDb({
    gyms: [{ id: 'gym-1', slug: 'cocate-gym', application_id: 'app-1' }],
    gym_connections: [{ id: 'c-1', gym_id: 'gym-1', schema_name: 'gym_cocate_gym' }],
    platform_subscriptions: [{ id: 's-1', gym_id: 'gym-1', status: 'trialing' }],
    migration_runs: [{ id: 'm-1', gym_id: 'gym-1', migration_id: 'schema.sql' }],
  });
  const d = provisioningDeps(db);
  assert.equal((await d.saveGym({ slug: 'cocate-gym', application_id: 'app-1' })).id, 'gym-1');
  assert.equal((await d.saveConnection({ gym_id: 'gym-1', schema_name: 'gym_cocate_gym' })).id, 'c-1');
  assert.equal((await d.startSubscription({ gym_id: 'gym-1' })).id, 's-1');
  await d.recordMigrationBaseline({ gym_id: 'gym-1', migration_id: 'schema.sql', checksum: 'x' });
  assert.equal(db.tables.gyms.length, 1);
  assert.equal(db.tables.gym_connections.length, 1);
  assert.equal(db.tables.platform_subscriptions.length, 1);
  assert.equal(db.tables.migration_runs.length, 1);
});

// ---------------------------------------------------------------------------
// Try again
// ---------------------------------------------------------------------------

test('Try again finishes the gym, then emails the owner their activation link', async () => {
  const d = deps();
  const r = await retryProvisioning('app-1', reviewer, d, { dryRun: false });
  assert.equal(r.ok, true);
  assert.equal(d.built.length, 1);
  assert.deepEqual(d.events.map((e) => e.event), ['provision_retried', 'provisioned']);
  assert.equal(d.invited[0].userId, 'owner-1', 'the applicant, who becomes the owner');
});

test('Try again is refused on a gym that was built — there is nothing to retry', async () => {
  const d = deps({ last: { event: 'provisioned' } });
  const r = await retryProvisioning('app-1', reviewer, d, { dryRun: false });
  assert.equal(r.ok, false);
  assert.equal(d.built.length, 0);
});

test('Try again is refused on an application that was not approved', async () => {
  for (const status of ['submitted', 'rejected', 'draft']) {
    const d = deps({ application: { ...APPROVED, status } });
    const r = await retryProvisioning('app-1', reviewer, d, { dryRun: false });
    assert.equal(r.ok, false, status);
    assert.equal(d.built.length, 0);
  }
});

test('Try again needs the permission to approve', async () => {
  const d = deps();
  const r = await retryProvisioning('app-1', { id: 'support-1', permissions: ['application.view'] }, d, { dryRun: false });
  assert.equal(r.ok, false);
  assert.equal(d.built.length, 0);
});

test('Try again is refused, and records nothing, when the token cannot reach the project', async () => {
  const d = { ...deps(), canReachProject: async () => ({ ok: false, reason: 'Supabase query failed: 401' }) };
  const r = await retryProvisioning('app-1', reviewer, d, { dryRun: false });
  assert.equal(r.ok, false);
  assert.match(r.error, /401/);
  assert.equal(d.events.length, 0);
});

test('a failed build is reported as a failed BUILD, not a failed decision', async () => {
  const d = {
    ...deps({ application: { ...APPROVED, status: 'submitted' }, build: { ok: false, failedAt: 'saveGym', error: 'Could not save the gym: boom', orphanedSchema: 'gym_cocate_gym' } }),
    updateApplication: async () => {},
    listDocuments: async () => ['id_document', 'business_registration', 'proof_of_address'].map((doc_type) => ({ doc_type, status: 'accepted' })),
  };
  const r = await approveApplication('app-1', reviewer, d, { dryRun: false });
  assert.equal(r.ok, false);
  assert.equal(r.provisionFailed, true);
  const failed = d.events.find((e) => e.event === 'provision_failed');
  assert.equal(failed.detail.orphaned_schema, 'gym_cocate_gym', 'the half-built schema is named, so it can be found');
});

// ---------------------------------------------------------------------------
// The reviewer's page
// ---------------------------------------------------------------------------

test('the application page offers Try again when the LATEST build failed — and only then', () => {
  const failed = [
    { event: 'approved', created_at: '2026-09-29T08:22:21Z' },
    { event: 'provision_failed', created_at: '2026-09-29T08:22:27Z', detail: { failed_at: 'saveConnection', error: 'Cannot read properties of null' } },
  ];
  const page = applicationDetailPage({ application: { ...APPROVED }, events: failed, csrfToken: 't' });
  assert.match(page, /The gym was not fully created/);
  assert.match(page, /at <b>saveConnection<\/b>/);
  assert.match(page, /name="action" value="retry_provision"/);

  const fixed = [...failed, { event: 'provisioned', created_at: '2026-09-29T09:00:00Z' }];
  const after = applicationDetailPage({ application: { ...APPROVED }, events: fixed.reverse(), csrfToken: 't' });
  assert.doesNotMatch(after, /retry_provision/, 'newest-first or oldest-first, a built gym offers no retry');
});

test('the decision route accepts Try again and hands it to the same decision path', async () => {
  let asked = null;
  const r = {
    statusCode: 200, headers: {}, body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    writeHead(code, h) { this.statusCode = code; for (const [k, v] of Object.entries(h || {})) this.headers[k.toLowerCase()] = v; return this; },
    end(b) { this.body = b || ''; return this; },
  };
  const q = {
    method: 'POST', url: '/platform/applications/app-1/decide',
    headers: { cookie: sessionCookie({ id: 'staff-1', email: 's@y', kind: 'platform_staff' }).split(';')[0], 'content-type': 'application/x-www-form-urlencoded' },
  };
  const body = `csrf=${encodeURIComponent(issueCsrfToken('staff-1'))}&action=retry_provision`;
  q[Symbol.asyncIterator] = async function* () { yield Buffer.from(body); };
  await handlePlatform(q, r, {
    audit: async () => {},
    permissionsFor: async () => ['application.approve', 'application.view'],
    decide: async (id, session, action) => { asked = { id, action }; return { ok: true }; },
  });
  assert.deepEqual(asked, { id: 'app-1', action: 'retry_provision' });
  assert.equal(r.statusCode, 302);
});
