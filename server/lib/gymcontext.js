// Which gym is this request for?
//
// This is the third branch of the architecture — the one that turns "a
// platform plus one gym" into "many separate gym tenants, each connected
// separately":
//
//     Many separate gym tenants
//       Gym 1 -> existing Yoyo Gym system
//       Gym 2 -> existing Yoyo Gym system
//       10,000+ gyms, each connected separately
//
// server/lib/tenancy.js has always known how to resolve a gym from a slug, and
// server/lib/supabase.js has always checked for one. Nothing ever supplied the
// slug. This does.
//
// ============================================================================
// WHY THE GYM COMES FROM THE TOKEN, AND NOT FROM THE URL
// ============================================================================
//
// Under D-016 every gym had its own Supabase project and its own secrets. D-096
// replaced that with one project and a schema per gym — which also means ONE
// SHARED JWT_SECRET. A member token minted by gym A therefore verifies
// perfectly against gym B.
//
// So if the gym were named by a header or a path segment, a member of gym A
// would type gym B's slug, their token would verify, and they would be inside
// gym B's data. The resolver would have done its job correctly the whole time,
// which is why no test of the resolver could ever catch it.
//
// Putting the gym inside the signed token removes the choice from the client.
// A header is still accepted for PUBLIC requests, which carry no token and
// expose nothing private, and where it disagrees with a token it is REFUSED
// rather than resolved in either direction — a mismatch is a bug or an attack,
// and both should be visible.
//
// ============================================================================
// BACKWARD COMPATIBILITY, WHICH IS NOT OPTIONAL
// ============================================================================
//
// Every admin and member token in the wild today carries NO gym claim, and the
// existing deployment sends no gym header. Both cases return null, which is
// what getSupabase() already treats as single-gym mode.
//
// So: nobody is logged out, and an existing gym deployment behaves exactly as
// it does now. That is asserted by the first two tests in the suite.
import { verifyToken } from './auth.js';
import { verifyMemberToken } from './memberauth.js';

/** A slug is a routing key. It must be a plain identifier before it goes near SQL. */
const SAFE_SLUG = /^[a-z0-9][a-z0-9-]{0,47}$/;

/** A refusal carrying the status the caller should return. */
export class GymContextError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'GymContextError';
    this.status = status;
  }
}

function bearer(req) {
  const header = String(req.headers?.authorization || '');
  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

/**
 * The gym slug for this request, or null for single-gym mode.
 *
 * @throws {GymContextError} 400 malformed slug, 401 unreadable token,
 *   403 header disagrees with the token.
 */
export function gymForRequest(req) {
  // ---- what the client asked for -----------------------------------------
  const raw = String(req.headers?.['x-gym-slug'] || '').trim();
  const asked = raw === '' ? null : raw.toLowerCase();

  if (asked !== null && !SAFE_SLUG.test(asked)) {
    // Refused, never sanitised. A slug that is not a plain identifier means
    // something upstream is wrong, and quietly rewriting it hides that.
    throw new GymContextError(400, 'Invalid gym identifier.');
  }

  // ---- what the token says ------------------------------------------------
  const token = bearer(req);
  if (!token) {
    // No token: a public request. The header is all there is, and these
    // endpoints expose nothing private.
    return asked;
  }

  // Either kind of token is acceptable here — this function only asks WHICH
  // GYM, not who you are. Authorisation stays where it already is.
  const payload = verifyToken(token) || verifyMemberToken(token);

  if (!payload) {
    // Deliberately NOT falling back to the header. Falling back would be a
    // way to bypass the token entirely: send rubbish in Authorization, send
    // whichever gym you want in the header.
    throw new GymContextError(401, 'Invalid or expired session.');
  }

  const claimed = payload.gym ? String(payload.gym).toLowerCase() : null;

  // An old token, from before gyms were stamped into them. Single-gym mode,
  // which is exactly what that token was issued for.
  if (!claimed) return asked === null ? null : asked;

  if (!SAFE_SLUG.test(claimed)) {
    throw new GymContextError(401, 'Invalid or expired session.');
  }

  if (asked !== null && asked !== claimed) {
    // The line this whole module exists for.
    throw new GymContextError(403, 'This session does not belong to that gym.');
  }

  return claimed;
}

/**
 * Run a handler inside its gym's context.
 *
 * THIS IS THE CONNECTION. Every request to a gym API goes through it, and it
 * is what finally calls resolveGym() and runWithGym() — the pair that has been
 * built, tested and unused since Stage 4.
 *
 * Single-gym mode is the path of least resistance on purpose: no gym, no
 * resolution, no query, straight to the handler. An existing deployment pays
 * nothing for this and behaves exactly as it did.
 *
 * @param {object} req
 * @param {object} res
 * @param {Function} run   the handler, called with no arguments
 * @param {Function} json  the JSON responder, so this file owes nothing to a
 *                         particular response helper
 */
export async function withGym(req, res, run, json) {
  let slug;
  try {
    slug = gymForRequest(req);
  } catch (err) {
    if (err instanceof GymContextError) return json(res, err.status, { error: err.message });
    throw err;
  }

  // Single-gym mode. Unchanged, and cheap.
  if (!slug) return run();

  const { resolveGym, runWithGym, ResolutionError } = await import('./tenancy.js');
  const { tenancyDeps } = await import('./tenancy-deps.js');

  let resolved;
  try {
    resolved = await resolveGym(slug, tenancyDeps());
  } catch (err) {
    if (err instanceof ResolutionError) {
      // The resolver's own statuses are already right: 404 unknown, 402
      // provisioned-but-not-paid, 403 suspended, 503 unreachable.
      return json(res, err.status, { error: err.message });
    }
    throw err;
  }

  return runWithGym(resolved, run);
}
