// "Sign in as member" — finding which gym you belong to.
//
// D-041 stands: a member normally PICKS THEIR GYM FIRST and signs in exactly
// as they always have. This is the recovery path for somebody who cannot
// remember which one they joined.
//
// The hashing lives in shared/member-directory.js, because the gym app writes
// these rows and the platform reads them, and D-081 forbids either importing
// the other. One definition, two readers.
export {
  normalisePhone,
  normaliseMembershipNumber,
  lookupHash,
  directoryRow,
} from '../shared/member-directory.js';

/**
 * Decide what to do with whatever the lookup returned.
 *
 * Pure, so the decision is testable without a database — and the decision is
 * the part that matters, because every branch here is a message to a stranger.
 *
 * @param {Array} matches rows from the directory, already filtered to gyms
 *   that may actually serve traffic.
 */
export function routeMember(matches) {
  const rows = Array.isArray(matches) ? matches : [];

  if (rows.length === 0) {
    // ONE MESSAGE FOR EVERY FAILURE. "No such membership number" and "wrong
    // phone" would together let anyone test whether a given person belongs to
    // any gym on the platform.
    return { ok: false, reason: 'We could not find a membership with those details.' };
  }

  if (rows.length === 1) {
    return { ok: true, gym: rows[0] };
  }

  // The same person at more than one gym — which is allowed, and is the only
  // case where the member has to answer a question. Guessing here would sign
  // somebody into the wrong gym.
  return { ok: true, choose: rows };
}

/** Constant-time compare, for callers checking a digest they were handed. */
export function sameHash(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
