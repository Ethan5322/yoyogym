// Gym resolution — the platform's isolation boundary.
//
// Under the chosen architecture one application serves every gym, and each gym
// has its own Supabase project. That means **this file replaces Row Level
// Security as the thing keeping gyms apart**. A bug here is a cross-tenant leak
// of health and biometric data, so it is written to fail closed everywhere and
// is covered by tests/isolation.test.js.
//
// Two rules it exists to enforce:
//
//   1. A client may NAME a gym; it is never GRANTED anything on that name
//      alone. Naming gets you as far as public catalog data. Everything else is
//      gated on credentials verified against that gym's own secret.
//   2. There is NO default gym. Every failure refuses. A fallback anywhere in
//      this chain is a cross-tenant leak waiting to happen.
//
// Dependencies are injected rather than imported so the resolver can be tested
// without a platform database, and so the caching layer can be added around it
// without touching this logic.
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request store for the resolved gym.
 *
 * AsyncLocalStorage rather than a module variable, so that concurrent requests
 * on one warm serverless instance cannot overwrite each other — the failure
 * that test 6 exists to catch. It also means the ~76 existing handlers need no
 * changes: they keep calling getSupabase() with no arguments, and it reads the
 * gym from here.
 */
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

/** Gym statuses that may serve traffic. Anything else is refused. */
const SERVING = new Set(['active']);

/** Connection statuses that may serve traffic. */
const REACHABLE = new Set(['healthy']);

/**
 * Resolve a gym identifier to that gym's own database client.
 *
 * @param {string} slug  public gym identifier, from a QR or app search
 * @param {object} deps  { lookupGym, fetchSecrets, createClient }
 * @returns {Promise<{gym, connection, secrets, client}>}
 * @throws {ResolutionError} on every failure — never a fallback
 */
export async function resolveGym(slug, deps) {
  if (!slug || typeof slug !== 'string') {
    throw new ResolutionError(404, 'No gym specified.', slug);
  }

  const record = await deps.lookupGym(slug);
  if (!record || !record.gym) {
    // Deliberately identical to a suspended gym's shape of failure at the
    // network level: do not confirm which gyms exist.
    throw new ResolutionError(404, 'Gym not found.', slug);
  }

  const { gym, connection } = record;

  if (!SERVING.has(gym.status)) {
    // 'pending' means approved and provisioned but not yet paid — the gym owner
    // needs to settle, which is a different fix from being suspended.
    const status = gym.status === 'pending' ? 402 : 403;
    throw new ResolutionError(status, `This gym is not active (${gym.status}).`, slug);
  }

  if (!connection || !REACHABLE.has(connection.status)) {
    throw new ResolutionError(503, 'This gym is temporarily unavailable.', slug);
  }

  let secrets;
  try {
    secrets = await deps.fetchSecrets(gym.id);
  } catch {
    // The secrets store is down. Refuse. Never reach for another gym's
    // credentials, and never fall back to the deployment's own environment.
    throw new ResolutionError(503, 'This gym is temporarily unavailable.', slug);
  }

  if (!secrets || !secrets.service_key) {
    throw new ResolutionError(503, 'This gym is temporarily unavailable.', slug);
  }

  const client = deps.createClient(connection.supabase_url, secrets.service_key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: connection.schema_name || 'gym' },
  });

  return { gym, connection, secrets, client };
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
