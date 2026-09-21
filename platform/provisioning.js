// Gym provisioning — turning an approved application into a working gym.
//
// Approval is automatic-provisioning (D-078): approving an application creates
// the Supabase project, loads the schema and seeds, writes the credentials to
// the secrets manager, and registers the gym. Thousands of gyms are in scope
// (D-012), so this cannot be a manual runbook.
//
// TWO THINGS THIS FILE IS BUILT AROUND
//
// 1. DRY RUN IS THE DEFAULT. Provisioning creates a real Supabase project that
//    costs real money every month. Calling this function without explicitly
//    asking for a live run must never spend anything.
//
// 2. A CREATED-BUT-UNRECORDED PROJECT IS THE EXPENSIVE FAILURE. If Supabase
//    creates the project and a later step fails, there is now a paid project
//    that nothing in the platform database knows about — a bill with no owner.
//    Every failure path therefore reports `orphanedProjectRef` so it can be
//    reconciled. **It is reported, not auto-deleted** — deleting a database
//    because a later step failed is how you destroy a gym's data over a
//    transient error. Cleanup is a human decision (see Q-48).
//
// Dependencies are injected so this is testable without a Supabase account, an
// Infisical token, or spending anything.

/** The provisioning sequence, in order. Exported so the dry run can show it. */
export const PROVISION_STEPS = [
  'createSupabaseProject',
  'applySchema',
  'seed',
  'storeSecret',
  'saveSecretRef',
  'saveGym',
  'saveConnection',
  'recordMigrationBaseline',
];

/**
 * Provision a gym from an approved application.
 *
 * @param {object} application  the approved gym_applications row
 * @param {object} deps         injected side effects (see tests for the shape)
 * @param {object} [options]
 * @param {boolean} [options.dryRun=true]  TRUE BY DEFAULT — nothing is created
 * @param {string}  [options.schemaVersion] migration id to record as baseline
 */
export async function provisionGym(application, deps, options = {}) {
  // Default to dry run. An accidental call must cost nothing.
  const dryRun = options.dryRun !== false;

  if (dryRun) {
    return {
      dryRun: true,
      ok: true,
      plan: [...PROVISION_STEPS],
      application_id: application.id,
      slug: application.slug,
      note: 'Dry run: nothing was created. Pass { dryRun: false } to provision for real.',
    };
  }

  // Tracked outside the try so a failure can still report what exists.
  let projectRef = null;
  let step = null;

  try {
    step = 'createSupabaseProject';
    const project = await deps.createSupabaseProject({
      name: application.proposed_gym_name || application.slug,
      region: application.region,
    });
    // From this line on, a real paid project exists.
    projectRef = project.project_ref;

    step = 'applySchema';
    await deps.applySchema({ project_ref: project.project_ref, url: project.url, service_key: project.service_key });

    step = 'seed';
    await deps.seed({ project_ref: project.project_ref, url: project.url, service_key: project.service_key });

    // The credentials go to the secrets manager FIRST, so that the platform
    // database only ever learns the reference. One blob per gym keeps rotation
    // atomic: one write, one version, one cache eviction.
    step = 'storeSecret';
    const stored = await deps.storeSecret({
      slug: application.slug,
      credentials: {
        supabase_url: project.url,
        service_key: project.service_key,
        jwt_secret: project.jwt_secret,
      },
    });

    step = 'saveSecretRef';
    // Only the pointer. No secret value may appear on this row — the invariant
    // from D-022, enforced by a test rather than by a constraint, because no
    // constraint can express "this text is not a secret".
    await deps.saveSecretRef({
      key_name: 'gym_credentials',
      secret_ref: stored.secret_ref,
      version: stored.version ?? 1,
    });

    step = 'saveGym';
    const gym = await deps.saveGym({
      slug: application.slug,
      search_name: application.proposed_gym_name,
      legal_name: application.legal_name ?? null,
      // Provisioned but NOT live: the first payment activates it (D-049).
      status: 'pending',
      owner_user_id: application.owner_user_id,
      application_id: application.id,
      country: application.country,
      city: application.city,
      latitude: application.latitude,
      longitude: application.longitude,
    });

    step = 'saveConnection';
    const connection = await deps.saveConnection({
      gym_id: gym.id,
      supabase_project_ref: project.project_ref,
      supabase_url: project.url,
      schema_name: 'gym',
      status: 'healthy',
    });

    step = 'recordMigrationBaseline';
    await deps.recordMigrationBaseline({
      gym_id: gym.id,
      migration_id: options.schemaVersion ?? 'schema.sql',
      checksum: options.schemaChecksum ?? null,
      status: 'succeeded',
      applied_by: 'orchestrator',
    });

    await deps.audit({
      action: 'gym.provisioned',
      entity: 'gym',
      entity_id: gym.id,
      detail: { slug: gym.slug, project_ref: project.project_ref },
    });

    return { ok: true, dryRun: false, gym, connection, projectRef };
  } catch (err) {
    // Report, do not clean up. If a project was created, say so loudly: that is
    // a monthly charge nobody is tracking until someone acts on this.
    await deps.audit({
      action: 'gym.provision.failed',
      entity: 'application',
      entity_id: application.id,
      detail: {
        failed_at: step,
        error: err.message,
        orphaned_project_ref: projectRef,
        slug: application.slug,
      },
    });

    return {
      ok: false,
      dryRun: false,
      failedAt: step,
      error: err.message,
      // null when nothing was created; a ref when a paid project is stranded.
      orphanedProjectRef: projectRef,
    };
  }
}
