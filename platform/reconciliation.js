// Reconciliation — find Supabase projects nobody is tracking.
//
// Provisioning can fail after the project exists (platform/provisioning.js),
// which leaves a database being billed every month that the registry knows
// nothing about. At ~$10/month each, one unnoticed failure is small; a year of
// unnoticed failures is not.
//
// It looks both ways:
//   ORPHAN   — a project exists, no gym_connections row points at it.
//              Usually a failed provision. Costs money.
//   DANGLING — a gym_connections row points at a project that no longer
//              exists. Usually a manual deletion. That gym is broken.
//
//   >>> THIS JOB REPORTS. IT NEVER DELETES. <<<
//
// It is not given a delete function at all, so it cannot destroy anything even
// if a future change tried to. Removing a project is a human decision, taken
// with platform/supabase-admin.js deleteProject(), which itself refuses unless
// the caller states the action is permanent.

/** Rough per-project monthly cost, used only to make the report concrete. */
const DEFAULT_COST_PER_PROJECT_USD = 10;

/**
 * Compare the real Supabase estate against the platform registry.
 *
 * @param {object} deps  { listProjects, listConnections, audit, platformProjectRefs }
 * @param {object} [options]
 * @param {number} [options.costPerProjectUsd=10]
 */
export async function reconcileProjects(deps, options = {}) {
  const costPer = options.costPerProjectUsd ?? DEFAULT_COST_PER_PROJECT_USD;

  const [projects, connections] = await Promise.all([
    deps.listProjects(),
    deps.listConnections(),
  ]);

  // Every ref the registry knows about, including retired ones — a retired gym
  // is accounted for, not unknown, and must not be reported twice.
  const known = new Set((connections || []).map((c) => c.supabase_project_ref));

  // The platform's own database has no gym row by design.
  const ours = new Set(deps.platformProjectRefs || []);

  const orphans = (projects || [])
    .filter((p) => !known.has(p.project_ref) && !ours.has(p.project_ref))
    .map((p) => ({
      project_ref: p.project_ref,
      name: p.name,
      created_at: p.created_at,
      likely_cause: 'provisioning failed after the project was created, or a manual creation',
    }));

  const live = new Set((projects || []).map((p) => p.project_ref));
  const dangling = (connections || [])
    .filter((c) => c.status !== 'retired' && !live.has(c.supabase_project_ref))
    .map((c) => ({
      gym_id: c.gym_id,
      supabase_project_ref: c.supabase_project_ref,
      likely_cause: 'the project was deleted outside the platform — this gym cannot serve traffic',
    }));

  const estimatedMonthlyWasteUsd = orphans.length * costPer;

  // Audit even a clean run's findings, so an unread report still leaves a trace.
  await deps.audit({
    action: 'reconciliation.findings',
    entity: 'platform',
    detail: {
      projects: (projects || []).length,
      connections: (connections || []).length,
      orphans: orphans.length,
      dangling: dangling.length,
      estimated_monthly_waste_usd: estimatedMonthlyWasteUsd,
    },
  });

  return {
    ok: orphans.length === 0 && dangling.length === 0,
    orphans,
    dangling,
    estimatedMonthlyWasteUsd,
    checkedProjects: (projects || []).length,
  };
}
