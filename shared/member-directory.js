// Turning a member's details into an opaque lookup value.
//
// IN shared/ BECAUSE BOTH SIDES NEED IT AND NEITHER MAY IMPORT THE OTHER.
// The gym app writes a directory row when a member registers; the platform
// reads it when somebody cannot remember which gym they joined. D-081 forbids
// server/ and platform/ importing each other, and shared/ is the common
// ground — one definition, two readers, no drift.
//
// If these two ever computed the digest differently, registration would file a
// member under one value and the lookup would ask for another, and "I do not
// remember my gym" would silently never find anybody.
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
