// Gym provisioning — turning an approved application into a working gym.
//
// Under D-096 a gym is a SCHEMA in the shared Supabase project, not a project
// of its own. So provisioning creates a schema, loads the gym schema into it,
// seeds it, exposes it to the API, and registers it.
//
// THREE THINGS THIS FILE IS BUILT AROUND
//
// 1. DRY RUN IS THE DEFAULT. Calling this without explicitly asking for a live
//    run must never change anything.
//
// 2. A CREATED-BUT-UNREGISTERED SCHEMA IS THE FAILURE THAT MATTERS. If the
//    schema is created and a later step fails, there is a schema holding a
//    gym's tables that the registry knows nothing about. Cheaper than a stranded
//    project was, but still invisible. Every failure path reports it as
//    `orphanedSchema` so reconciliation can find it. **It is reported, not
//    dropped** — dropping a schema because a later step failed is how a
//    transient error destroys a gym's data.
//
// 3. EXPOSING THE SCHEMA RELOADS POSTGREST FOR EVERY GYM (D-097). It is the
//    last mutating step, and deliberately so: everything that can fail should
//    fail before anything touches the running system.

/** The provisioning sequence, in order. Exported so a dry run can show it. */
import { startTrial } from './billing.js';

export const PROVISION_STEPS = [
  'createSchema',
  'applySchema',
  'seed',
  'saveGym',
  'saveConnection',
  'recordMigrationBaseline',
  'startSubscription',
  'exposeSchema',
];

/**
 * A schema name must be a plain identifier — it is interpolated into DDL.
 * Refused rather than sanitised: a slug that produces anything else is a bug
 * upstream, and quietly rewriting it would hide that.
 */
const SAFE_SCHEMA = /^[a-z_][a-z0-9_]{0,50}$/;

/** `iron-works` → `gym_iron_works`. Slug-based, not lettered: no 26-gym ceiling. */
export function schemaNameFor(slug) {
  const cleaned = String(slug || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned ? `gym_${cleaned}`.slice(0, 51) : null;
}

/**
 * Provision a gym from an approved application.
 *
 * @param {object} application  the approved gym_applications row
 * @param {object} deps         injected side effects
 * @param {object} [options]
 * @param {boolean} [options.dryRun=true]  TRUE BY DEFAULT — nothing changes
 */
export async function provisionGym(application, deps, options = {}) {
  const dryRun = options.dryRun !== false;
  const schema = options.schemaName || schemaNameFor(application.slug);

  if (!schema || !SAFE_SCHEMA.test(schema)) {
    return { ok: false, failedAt: 'schemaName', error: `Cannot derive a safe schema name from "${application.slug}".`, orphanedSchema: null };
  }

  // REFUSED BEFORE ANYTHING IS CREATED, not at step six of seven.
  //
  // `migration_runs.checksum` is NOT NULL, and it records which schema version
  // a gym was built from. Without it the run would create the schema, apply
  // it, seed it, save two rows — and then fail on a constraint, leaving a real
  // schema behind that the registry half knows about.
  //
  // A missing checksum also means db/schema.sql could not be read, which means
  // applySchema has nothing to apply. Failing here costs nothing; failing at
  // step six costs an orphan.
  if (options.dryRun === false && !options.schemaChecksum) {
    return {
      ok: false,
      failedAt: 'schemaChecksum',
      error:
        'Cannot read db/schema.sql, so there is no schema to apply and no version to record. ' +
        'Nothing was created.',
      orphanedSchema: null,
    };
  }

  if (dryRun) {
    return {
      dryRun: true,
      ok: true,
      plan: [...PROVISION_STEPS],
      schema,
      application_id: application.id,
      note: 'Dry run: nothing was created. Pass { dryRun: false } to provision for real.',
    };
  }

  let schemaCreated = false;
  let step = null;

  try {
    step = 'createSchema';
    await deps.createSchema(schema);
    schemaCreated = true;

    step = 'applySchema';
    await deps.applySchema(schema);

    step = 'seed';
    await deps.seed(schema, application);

    step = 'saveGym';
    const gym = await deps.saveGym({
      slug: application.slug,
      search_name: application.proposed_gym_name,
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
      // Schema mode: no per-gym project, no per-gym credentials (D-098).
      supabase_project_ref: options.projectRef ?? null,
      supabase_url: null,
      schema_name: schema,
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

    // A gym with no subscription row is refused by accessFor() with a 402
    // (platform/billing.js), so the trial is opened here, as part of
    // provisioning, rather than waiting for the first billing run.
    //
    // NOTE the gym itself stays 'pending' above: the trial is a subscription
    // state, and what makes a gym LIVE is the owner completing activation.
    step = 'startSubscription';
    const subscription = await deps.startSubscription({
      ...startTrial({ gymId: gym.id, plan: options.plan ?? null, now: new Date() }),
      plan_id: options.plan?.id ?? null,
    });

    // LAST, because it reloads PostgREST for every gym on the project (D-097).
    // Everything that can fail has already failed by this point.
    step = 'exposeSchema';
    await deps.exposeSchema(schema);

    await deps.audit({
      action: 'gym.provisioned',
      entity: 'gym',
      entity_id: gym.id,
      detail: { slug: gym.slug, schema },
    });

    return { ok: true, dryRun: false, gym, connection, subscription, schema };
  } catch (err) {
    await deps.audit({
      action: 'gym.provision.failed',
      entity: 'application',
      entity_id: application.id,
      detail: {
        failed_at: step,
        error: err.message,
        orphaned_schema: schemaCreated ? schema : null,
        slug: application.slug,
      },
    });

    return {
      ok: false,
      dryRun: false,
      failedAt: step,
      error: err.message,
      // Reported, never dropped. Reconciliation decides what happens next.
      orphanedSchema: schemaCreated ? schema : null,
    };
  }
}
