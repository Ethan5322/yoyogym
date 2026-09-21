// Gym resolution — the platform's isolation boundary.
//
// TWO TENANCY SHAPES, one resolver.
//
//   SCHEMA MODE (in use). All gyms share ONE Supabase project, each with its own
//     Postgres schema — gym_ironworks.members, gym_flexhouse.members. This is
//     free on Supabase's free plan and needs no change to the ~76 handlers,
//     because getSupabase() has always configured `db.schema`. The handlers call
//     .from('members') and Postgres resolves it inside that gym's schema.
//
//   PROJECT MODE (available). A gym has its own Supabase project and its own
//     credentials — for one that outgrows the shared project, or wants its data
//     in its own account. The connection row carries a `supabase_url`, and the
//     credentials come from the secrets store.
//
// ⚠️ ISOLATION IS NOW LOGICAL, NOT PHYSICAL. Every gym in schema mode lives in
// one database. Previously a resolver bug meant a wrong answer; now it means
// one gym reading another's members, health answers and biometric templates.
// **This file replaces RLS as the thing keeping gyms apart**, so it fails closed
// everywhere and is covered by tests/isolation.test.js.
//
// Two rules it exists to enforce:
//
//   1. A client may NAME a gym; it is never GRANTED anything on that name alone.
//   2. There is NO default. No default gym, and — the dangerous one — **no
//      default schema**. Falling back to `gym` would serve the original gym's
//      data to whoever asked.
import { AsyncLocalStorage } from 'node:async_hooks';

const store = new AsyncLocalStorage();

/** A refusal carrying the HTTP status the caller should return. */
export class ResolutionError extends Error {
  constructor(status, message, slug) {
    super(message);
    this.name = 'ResolutionError';
    this.status = status;
    this.slug = slug;
  }
}

/** Gym statuses that may serve traffic. */
const SERVING = new Set(['active']);

/** Connection statuses that may serve traffic. */
const REACHABLE = new Set(['healthy']);

/**
 * A schema name must be a plain identifier.
 *
 * The value reaches a database client, and a registry row should never contain
 * anything else. Refused rather than sanitised: sanitising hides the fact that
 * something put a strange value in the registry, which is the actual problem.
 */
const SAFE_SCHEMA = /^[a-z_][a-z0-9_]{0,62}$/i;

/**
 * Resolve a gym identifier to that gym's own database client.
 *
 * @param {string} slug  public gym identifier, from a QR or app search
 * @param {object} deps  { lookupGym, fetchSecrets, createClient, shared }
 *   `shared` is the platform's own project: { url, key }. Used in schema mode.
 * @returns {Promise<{gym, connection, schema, client}>}
 * @throws {ResolutionError} on every failure — never a fallback
 */
export async function resolveGym(slug, deps) {
  if (!slug || typeof slug !== 'string') {
    throw new ResolutionError(404, 'No gym specified.', slug);
  }

  const record = await deps.lookupGym(slug);
  if (!record || !record.gym) {
    throw new ResolutionError(404, 'Gym not found.', slug);
  }

  const { gym, connection } = record;

  if (!SERVING.has(gym.status)) {
    // 'pending' means provisioned but not yet paid, which the owner fixes
    // differently from a suspension.
    const status = gym.status === 'pending' ? 402 : 403;
    throw new ResolutionError(status, `This gym is not active (${gym.status}).`, slug);
  }

  if (!connection || !REACHABLE.has(connection.status)) {
    throw new ResolutionError(503, 'This gym is temporarily unavailable.', slug);
  }

  // The schema IS the isolation boundary in schema mode. A missing or malformed
  // one is refused — never defaulted.
  const schema = connection.schema_name;
  if (!schema || !SAFE_SCHEMA.test(schema)) {
    throw new ResolutionError(503, 'This gym is temporarily unavailable.', slug);
  }

  // Project mode when the connection names its own project; schema mode
  // otherwise. The distinction is one field, so a gym can be moved to its own
  // project later by filling it in.
  const ownProject = Boolean(connection.supabase_url);

  let url;
  let key;

  if (ownProject) {
    url = connection.supabase_url;
    let secrets;
    try {
      secrets = await deps.fetchSecrets(gym.id);
    } catch {
      throw new ResolutionError(503, 'This gym is temporarily unavailable.', slug);
    }
    if (!secrets?.service_key) {
      // Never quietly fall back to the shared project: that would put this
      // gym's queries against a database it does not belong to.
      throw new ResolutionError(503, 'This gym is temporarily unavailable.', slug);
    }
    key = secrets.service_key;
  } else {
    if (!deps.shared?.url || !deps.shared?.key) {
      throw new ResolutionError(503, 'This gym is temporarily unavailable.', slug);
    }
    url = deps.shared.url;
    key = deps.shared.key;
  }

  const client = deps.createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema },
  });

  return { gym, connection, schema, client };
}

/**
 * Run `fn` with `resolved` as the current gym for everything it awaits.
 * Nothing outside this scope can see it.
 */
export function runWithGym(resolved, fn) {
  return store.run(resolved, fn);
}

/** The current request's resolved gym, or undefined outside a request. */
export function currentGym() {
  return store.getStore();
}
