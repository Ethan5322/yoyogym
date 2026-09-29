// Run a scheduled job for EVERY gym, each inside its own schema.
//
// The scheduled jobs — expiry, overdue suspensions, reminders, pauses ending,
// the owner's daily summary — were called by Vercel with no gym named, so they
// ran for the deployment's own gym (KOM) and for nobody else. A second gym's
// memberships never expired, its members were never reminded, its pauses never
// ended and its owner never got a summary. Found evaluating the first live gym
// after it was built (2026-09-29).
//
// Each gym is resolved exactly as a request for it would be (resolveGym), so a
// job can only ever touch the gym it is running for — getSupabase() inside the
// job returns that gym's client. One gym failing is recorded and the next gym
// still runs.
import { getSupabase } from './supabase.js';

/**
 * @param {(supabase: object) => Promise<any>} job
 * @param {object} [options]
 * @param {object} [options.tenancy]  registry access, for tests
 * @returns {Promise<Record<string, any>>} each gym's result, keyed by slug
 */
export async function forEveryGym(job, options = {}) {
  const tenancy = options.tenancy ?? (await import('./tenancy-deps.js')).tenancyDeps();
  const { resolveGym, runWithGym } = await import('./tenancy.js');

  let slugs = null;
  try {
    slugs = await tenancy.servingGymSlugs();
  } catch (err) {
    // The registry could not be read: the deployment's own gym still gets its
    // jobs, exactly as before the platform existed (fail open for faults).
    console.error('scheduled jobs: registry unreadable, running the home gym only:', err?.message);
  }

  const results = {};

  // The deployment's own gym when the registry does not know it — a standalone
  // deployment, or a registry that could not be read. Run once, unscoped.
  const home = slugs ? await tenancy.homeGymSlug?.().catch(() => null) : null;
  if (!slugs || !home) {
    results.home = await safely(() => job(getSupabase()));
  }

  for (const slug of slugs || []) {
    results[slug] = await safely(async () => {
      const resolved = await resolveGym(slug, tenancy);
      return runWithGym(resolved, () => job(getSupabase()));
    });
  }

  return results;
}

async function safely(fn) {
  try {
    return await fn();
  } catch (err) {
    console.error('scheduled job failed for one gym:', err?.message);
    return { error: err?.message || 'failed' };
  }
}
