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

// ---------------------------------------------------------------------------
// Schema drift — the same job, for the tenancy model we actually chose
// ---------------------------------------------------------------------------
//
// reconcileProjects() above is written for project-per-gym, which D-096
// superseded. It is kept because the estate may still span more than one
// project one day, and a report that exists is worth more than one that has
// to be rewritten first.
//
// Under schema-per-gym the same provisioning failure leaves a SCHEMA behind,
// and the consequence is different in kind. A stranded project cost ~$10 a
// month, which is a bill. A stranded schema costs almost nothing and may hold
// a real person's name, phone number and ID document, which is not a bill —
// it is personal data with nobody accountable for it (POPIA).
//
//   >>> THIS REPORTS. IT NEVER DROPS A SCHEMA. <<<
//
// It is given no way to execute SQL, so it could not drop one if a later
// change tried to make it.

/** Schemas that belong to Postgres, Supabase or the platform — never a gym. */
const NOT_A_GYM = new Set([
  'public', 'platform', 'auth', 'storage', 'graphql', 'graphql_public',
  'realtime', 'supabase_functions', 'supabase_migrations', 'extensions',
  'vault', 'pgsodium', 'pgsodium_masks', 'information_schema', 'pg_catalog',
  'pg_toast', 'cron', 'net', 'pgbouncer',
]);

/** Gym schemas are named by provisioning: `gym_<slug>` (platform/provisioning.js). */
const GYM_SCHEMA = /^gym_[a-z0-9_]+$/;

/**
 * Compare the schemas that exist against the gyms the registry knows about.
 *
 * @param {object} deps  { listSchemas, listConnections, audit }
 */
export async function reconcileSchemas(deps) {
  const [schemas, connections] = await Promise.all([deps.listSchemas(), deps.listConnections()]);

  const candidates = (schemas || []).filter((name) => !NOT_A_GYM.has(name) && GYM_SCHEMA.test(name));

  // Every schema the registry accounts for, RETIRED ONES INCLUDED. A retired
  // gym's schema is deliberately kept — that is what makes it recoverable —
  // so reporting it as an orphan would be reporting a decision as a fault.
  const known = new Set((connections || []).map((c) => c.schema_name).filter(Boolean));

  const orphans = candidates
    .filter((name) => !known.has(name))
    .map((name) => ({
      schema_name: name,
      risk: 'Personal data may be sitting in this schema with no gym record saying who is responsible for it.',
      likely_cause: 'provisioning failed after the schema was created, or a manual creation',
      next_step: 'A human must look inside before anything is removed.',
    }));

  const live = new Set(candidates);
  const dangling = (connections || [])
    .filter((c) => c.status !== 'retired' && c.schema_name && !live.has(c.schema_name))
    .map((c) => ({
      gym_id: c.gym_id,
      schema_name: c.schema_name,
      // This one is urgent in a way an orphan is not: real members are being
      // turned away from a gym right now.
      impact: 'This gym cannot serve traffic. Its members cannot sign in.',
      likely_cause: 'the schema was dropped outside the platform',
    }));

  await deps.audit({
    action: 'reconciliation.schemas',
    entity: 'platform',
    detail: {
      schemas_seen: candidates.length,
      connections: (connections || []).length,
      orphans: orphans.length,
      dangling: dangling.length,
    },
  });

  return {
    ok: orphans.length === 0 && dangling.length === 0,
    orphans,
    dangling,
    checkedSchemas: candidates.length,
  };
}
