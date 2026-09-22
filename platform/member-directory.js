// "Sign in as member" — finding which gym you belong to.
//
// The member types their membership number and phone, and does NOT say which
// gym. The system has to work that out. Two facts make the obvious approaches
// impossible:
//
//   1. `membership_number` is unique WITHIN one gym's schema, not globally.
//      Two gyms can each have GYM-2026-000123, and they are different people.
//   2. There are meant to be ten thousand gyms. Querying every schema on every
//      sign-in attempt is not a slow design, it is not a design.
//
// So the platform keeps a ROUTING INDEX: one row per member, holding an opaque
// digest and the gym it belongs to. One indexed lookup, whatever the number of
// gyms.
//
// ============================================================================
// WHAT IS AND IS NOT STORED, AND WHY IT IS AN HMAC
// ============================================================================
//
// The row holds a digest and a gym id. No name, no readable phone, no
// membership number, nothing a person could be identified from. The platform
// holds no member data (D-013, D-044) and the gym stays the responsible party
// for its own members (D-014) — an index that routes must not become a
// shadow copy of every gym's membership.
//
// It is an HMAC WITH A SERVER-SIDE KEY, not a plain hash, and that is the
// important part. A membership number is about a million possibilities and a
// phone number is knowable. With a plain SHA-256 table, anyone who obtained it
// and knew a person's phone could brute-force the membership number in seconds
// and learn which gym that person attends — which is exactly the kind of fact
// people expect a gym not to leak. An HMAC makes the table useless without the
// key, which is never in the table.
import { createHmac, timingSafeEqual } from 'node:crypto';

/** Read at call time, never at import, so tests need no environment. */
function key() {
  const secret = process.env.PLATFORM_DIRECTORY_KEY || process.env.PLATFORM_JWT_SECRET;
  if (!secret) {
    throw new Error('Missing PLATFORM_DIRECTORY_KEY — the member directory cannot be keyed.');
  }
  return secret;
}

/**
 * Normalise a phone number to digits.
 *
 * People type +27 82 123 4567, 0821234567 and 27821234567 for the same phone.
 * A lookup that treated those as three different people would send a member
 * back to the sign-in screen over a space.
 *
 */
export function normalisePhone(value) {
  const digits = String(value ?? '').replace(/\D+/g, '');
  if (!digits) return '';

  // THE LAST NINE DIGITS, and nothing else.
  //
  // A first attempt stripped leading zeros, and a test caught that it made
  // "+27 82 123 4567" and "0821234567" — one phone — into two different
  // members. Country codes and trunk zeros vary by how a person types, and a
  // member sent back to the sign-in screen over a "+" has been failed by the
  // software.
  //
  // The subscriber part is the stable piece across those forms. The cost,
  // stated rather than discovered: two people in different countries whose
  // last nine digits coincide would collide. That is why this value NEVER
  // authenticates anyone — it only narrows which gym to ask, and the gym's own
  // login then checks the full phone against its own records.
  return digits.slice(-9);
}

/** Membership numbers are case-insensitive and often typed with stray spaces. */
export function normaliseMembershipNumber(value) {
  return String(value ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

/**
 * The opaque lookup value for a member.
 *
 * The same two inputs always produce the same digest, and the digest reveals
 * nothing about either input without the key.
 */
export function lookupHash({ membershipNumber, phone }) {
  const number = normaliseMembershipNumber(membershipNumber);
  const digits = normalisePhone(phone);

  if (!number || !digits) return null;

  // A separator that cannot appear in either input, so ("AB", "1") and
  // ("A", "B1") cannot collide.
  return createHmac('sha256', key()).update(`${number}\u0000${digits}`).digest('hex');
}

/** The row written when a member registers. No personal data in it. */
export function directoryRow({ membershipNumber, phone, gymId }) {
  const hash = lookupHash({ membershipNumber, phone });
  if (!hash) return null;
  return { lookup_hash: hash, gym_id: gymId };
}

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
