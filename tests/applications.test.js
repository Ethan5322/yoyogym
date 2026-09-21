// Application review tests, written before the flow.
//
// Reviewing is where a human decision turns into infrastructure that costs
// money, so the two failures that matter are:
//   - approving twice, which provisions twice and bills twice
//   - a decision that leaves no trace of who made it or why
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { approveApplication, rejectApplication, requestMoreInfo } from '../platform/applications.js';

const reviewer = { id: 'staff-1', email: 'owner@yoyogyms.com', permissions: ['application.approve', 'application.reject'] };

function deps(application) {
  const events = [];
  const updates = [];
  const provisioned = [];
  return {
    events,
    updates,
    provisioned,
    getApplication: async () => application,
    updateApplication: async (id, patch) => {
      updates.push({ id, patch });
      Object.assign(application, patch);
      return application;
    },
    // Append-only by construction: there is no update or delete function here.
    appendEvent: async (e) => { events.push(e); return e; },
    provisionGym: async (app, opts) => {
      provisioned.push({ app: app.id, opts });
      return { ok: true, gym: { id: 'gym-1', slug: app.slug } };
    },
    audit: async () => {},
  };
}

const submitted = () => ({ id: 'app-1', slug: 'iron-works', status: 'submitted', applicant_user_id: 'user-1' });

test('approving a submitted application records the decision and provisions', async () => {
  const app = submitted();
  const d = deps(app);

  const r = await approveApplication('app-1', reviewer, d, { dryRun: false });

  assert.equal(r.ok, true);
  assert.equal(app.status, 'approved');
  assert.equal(app.decided_by, 'staff-1');
  assert.ok(app.decided_at, 'the decision is timestamped');

  // Approval and provisioning are recorded SEPARATELY, because they can
  // diverge: a correct human decision can be followed by a failed provision
  // (see the last test in this file). One combined event would lose that.
  assert.deepEqual(d.events.map((e) => e.event), ['approved', 'provisioned']);
  assert.equal(d.events[0].actor_user_id, 'staff-1');
  assert.equal(d.events[1].detail.gym_id, 'gym-1');

  assert.equal(d.provisioned.length, 1, 'approval provisions the gym');
});

test('approving twice does NOT provision twice — that is a double bill', async () => {
  const app = submitted();
  const d = deps(app);

  await approveApplication('app-1', reviewer, d, { dryRun: false });
  const second = await approveApplication('app-1', reviewer, d, { dryRun: false });

  assert.equal(second.ok, false);
  assert.match(second.error, /already/i);
  assert.equal(d.provisioned.length, 1, 'the second approval must create nothing');
});

test('a rejected application cannot then be approved', async () => {
  const app = { ...submitted(), status: 'rejected' };
  const d = deps(app);

  const r = await approveApplication('app-1', reviewer, d, { dryRun: false });
  assert.equal(r.ok, false);
  assert.equal(d.provisioned.length, 0);
});

test('approving requires the permission', async () => {
  const app = submitted();
  const d = deps(app);
  const nosy = { id: 'staff-2', email: 'support@yoyogyms.com', permissions: ['gym.view'] };

  const r = await approveApplication('app-1', nosy, d, { dryRun: false });

  assert.equal(r.ok, false);
  assert.match(r.error, /permission/i);
  assert.equal(d.provisioned.length, 0);
  assert.equal(app.status, 'submitted', 'a refused decision changes nothing');
});

test('rejection REQUIRES a reason — the owner is told why and may reapply', async () => {
  const app = submitted();
  const d = deps(app);

  const missing = await rejectApplication('app-1', reviewer, '', d);
  assert.equal(missing.ok, false);
  assert.match(missing.error, /reason/i);
  assert.equal(app.status, 'submitted');

  const done = await rejectApplication('app-1', reviewer, 'Proof of premises was illegible.', d);
  assert.equal(done.ok, true);
  assert.equal(app.status, 'rejected');
  assert.equal(d.events.at(-1).event, 'rejected');
  assert.equal(d.events.at(-1).reason, 'Proof of premises was illegible.');
});

test('requesting more information sends it back without deciding it', async () => {
  const app = submitted();
  const d = deps(app);

  const r = await requestMoreInfo('app-1', reviewer, 'Please resend the tax clearance.', d);

  assert.equal(r.ok, true);
  assert.equal(app.status, 'info_requested');
  assert.equal(app.decided_at, undefined, 'asking a question is not a decision');
  assert.equal(d.events.at(-1).event, 'info_requested');
});

test('dry run is inherited — approving does not provision by accident', async () => {
  const app = submitted();
  const d = deps(app);

  await approveApplication('app-1', reviewer, d);   // no options

  assert.equal(d.provisioned[0].opts.dryRun, true, 'the default must reach the orchestrator');
});

test('a failed provision does not leave the application looking successful', async () => {
  const app = submitted();
  const d = deps(app);
  d.provisionGym = async () => ({ ok: false, failedAt: 'createSupabaseProject', error: 'quota exceeded', orphanedProjectRef: null });

  const r = await approveApplication('app-1', reviewer, d, { dryRun: false });

  assert.equal(r.ok, false);
  assert.equal(app.status, 'approved', 'the human decision stands — it was correct');
  const last = d.events.at(-1);
  assert.equal(last.event, 'provision_failed', 'but the failure is recorded as its own event');
  assert.ok(last.detail.error);
});
