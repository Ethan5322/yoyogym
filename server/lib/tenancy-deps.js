// What resolveGym() needs in order to reach a real gym.
//
// server/lib/tenancy.js takes every side effect as an argument, which is what
// makes it testable with no database. This is the file that supplies the real
// ones — the registry lookup, the secrets read, and the shared project's
// credentials.
//
// It reads the `platform` schema directly rather than importing anything from
// platform/, because D-081 forbids that import and this is a data access, not
// a dependency: the platform owns those tables, and this reads them the same
// way any other consumer would.
import { createClient } from '@supabase/supabase-js';

/**
 * A short-lived cache of resolved gyms.
 *
 * WITHOUT THIS, EVERY REQUEST COSTS TWO QUERIES AGAINST THE REGISTRY. At ten
 * thousand gyms that is the busiest table in the system, serving data that
 * changes a few times a year.
 *
 * Thirty seconds is chosen against what it delays: suspending a gym should
 * stop it quickly. Half a minute of a suspended gym still serving is
 * acceptable; five minutes is not, and no cache at all is a self-inflicted
 * load problem.
 */
const TTL_MS = 30_000;
const cache = new Map();

/** Drop a gym from the cache — called when the platform changes its status. */
export function forgetGym(slug) {
  cache.delete(String(slug || '').toLowerCase());
}

let _platform = null;

/** A client scoped to the platform schema, for the registry lookup only. */
function platformClient() {
  if (_platform) return _platform;

  const url = process.env.PLATFORM_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.PLATFORM_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Cannot resolve a gym: the platform database is not configured.');
  }

  _platform = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'platform' },
  });
  return _platform;
}

export function tenancyDeps() {
  return {
    /** The registry row for a slug, with its connection. */
    lookupGym: async (slug) => {
      const key = String(slug).toLowerCase();

      const hit = cache.get(key);
      if (hit && hit.expires > Date.now()) return hit.value;

      const db = platformClient();

      const { data: gym } = await db
        .from('gyms')
        .select('id, slug, status, plan_key, search_name')
        .eq('slug', key)
        .maybeSingle();

      if (!gym) {
        // Cached too, and deliberately: a wrong slug in a QR code printed on a
        // wall will be scanned all day, and every scan would otherwise be a
        // query.
        cache.set(key, { value: null, expires: Date.now() + TTL_MS });
        return null;
      }

      const { data: connection } = await db
        .from('gym_connections')
        .select('gym_id, schema_name, supabase_url, supabase_project_ref, status')
        .eq('gym_id', gym.id)
        .maybeSingle();

      // THE GYM'S PLAN — what it may use and how many members it may have.
      //
      // Read here, with the gym, because until now it was read NOWHERE: the
      // resolved gym carried no plan, so every feature check saw nothing and
      // every member limit was "none". Data, not code (CLAUDE.md §18.4): an
      // edit on the platform's plans screen applies within the cache window,
      // with no deploy.
      let plan = null;
      if (gym.plan_key) {
        const { data, error } = await db
          .from('platform_plans')
          .select('key, features, max_active_members')
          .eq('key', gym.plan_key)
          .maybeSingle();
        if (error) throw new Error(`Could not read the gym's plan: ${error.message}`);
        plan = data ?? null;
      }

      const value = { gym, connection, plan };
      cache.set(key, { value, expires: Date.now() + TTL_MS });
      return value;
    },

    /**
     * A gym's own credentials — project mode only.
     *
     * NEVER CACHED. These are secrets, and a rotated key must take effect on
     * the next request rather than up to thirty seconds later.
     */
    fetchSecrets: async (gymId) => {
      const db = platformClient();
      const { data } = await db
        .from('gym_secrets')
        .select('service_role_key, anon_key')
        .eq('gym_id', gymId)
        .maybeSingle();

      if (!data) throw new Error('No credentials recorded for this gym.');
      return data;
    },

    createClient,

    /** The shared project — schema mode, which is every gym under D-096. */
    shared: {
      url: process.env.SUPABASE_URL,
      key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
  };
}
