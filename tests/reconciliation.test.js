// Reconciliation tests, written before the job.
//
// The problem it solves: a Supabase project that exists and is being billed,
// but which the platform registry knows nothing about — usually because
// provisioning failed partway. Nobody notices a $10/month charge.
//
// The rule it must never break: reconciliation REPORTS, it does not delete.
// Deleting a project because it looks unrecognised is how a gym loses its
// database to an off-by-one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileProjects } from '../platform/reconciliation.js';

function deps(projects, connections, { platformRefs = [] } = {}) {
  const audited = [];
  return {
    audited,
    listProjects: async () => projects,
    listConnections: async () => connections,
    // Projects belonging to the platform itself, not to any gym.
    platformProjectRefs: platformRefs,
    audit: async (e) => audited.push(e),
  };
}

test('a fully matched estate reports nothing', async () => {
  const d = deps(
    [{ project_ref: 'aaa', name: 'iron-works' }],
    [{ gym_id: 'gym-1', supabase_project_ref: 'aaa', status: 'healthy' }]
  );

  const r = await reconcileProjects(d);

  assert.equal(r.orphans.length, 0);
  assert.equal(r.dangling.length, 0);
  assert.equal(r.ok, true);
});

test('a project with no registry row is reported as an orphan — and NOT deleted', async () => {
  const d = deps(
    [
      { project_ref: 'aaa', name: 'iron-works' },
      { project_ref: 'zzz', name: 'flex-house' }, // provisioning died before saveGym
    ],
    [{ gym_id: 'gym-1', supabase_project_ref: 'aaa', status: 'healthy' }]
  );

  const r = await reconcileProjects(d);

  assert.equal(r.orphans.length, 1);
  assert.equal(r.orphans[0].project_ref, 'zzz');
  assert.equal(r.ok, false, 'an orphan is a finding, not a clean run');
  // No delete function is even provided to this job — it cannot destroy anything.
  assert.equal(typeof d.deleteProject, 'undefined');
});

test('a registry row pointing at a project that does not exist is reported as dangling', async () => {
  const d = deps(
    [{ project_ref: 'aaa', name: 'iron-works' }],
    [
      { gym_id: 'gym-1', supabase_project_ref: 'aaa', status: 'healthy' },
      { gym_id: 'gym-2', supabase_project_ref: 'gone', status: 'healthy' },
    ]
  );

  const r = await reconcileProjects(d);

  assert.equal(r.dangling.length, 1);
  assert.equal(r.dangling[0].gym_id, 'gym-2');
  assert.equal(r.ok, false);
});

test("the platform's own project is never treated as an orphan", async () => {
  const d = deps(
    [
      { project_ref: 'platform-1', name: 'yoyo-platform' },
      { project_ref: 'aaa', name: 'iron-works' },
    ],
    [{ gym_id: 'gym-1', supabase_project_ref: 'aaa', status: 'healthy' }],
    { platformRefs: ['platform-1'] }
  );

  const r = await reconcileProjects(d);
  assert.equal(r.orphans.length, 0, 'the platform database has no gym row by design');
});

test('retired connections still count as known, so a retired gym is not double-reported', async () => {
  const d = deps(
    [{ project_ref: 'old', name: 'closed-gym' }],
    [{ gym_id: 'gym-9', supabase_project_ref: 'old', status: 'retired' }]
  );

  const r = await reconcileProjects(d);
  assert.equal(r.orphans.length, 0);
});

test('findings are audited so an unread report still leaves a trace', async () => {
  const d = deps([{ project_ref: 'zzz', name: 'stray' }], []);
  await reconcileProjects(d);

  assert.equal(d.audited.length, 1);
  assert.equal(d.audited[0].action, 'reconciliation.findings');
  assert.equal(d.audited[0].detail.orphans, 1);
});

test('an estimated monthly cost is reported, because that is the point', async () => {
  const d = deps(
    [
      { project_ref: 'x', name: 'a' },
      { project_ref: 'y', name: 'b' },
    ],
    []
  );

  const r = await reconcileProjects(d, { costPerProjectUsd: 10 });
  assert.equal(r.estimatedMonthlyWasteUsd, 20);
});
