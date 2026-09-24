// Member-portal authentication (separate from admin auth). Issues a short-lived
// member JWT after the member proves identity with their membership number +
// phone number. Lower-stakes than admin, but still gated by two factors.
import jwt from 'jsonwebtoken';
import { unauthorized } from './http.js';

const SECRET = process.env.JWT_SECRET;
const EXPIRES_IN = '12h';
const AUDIENCE = 'member';

if (!SECRET) throw new Error('Missing JWT_SECRET environment variable.');

/**
 * `gym` stamps the token with its tenant — see signToken in ./auth.js for why.
 * Optional, and omitting it is single-gym mode, so existing member sessions
 * are unaffected.
 */
export function signMemberToken(member, { gym = null } = {}) {
  const claims = { sub: member.id, membership_number: member.membership_number };
  if (gym) claims.gym = String(gym).toLowerCase();

  return jwt.sign(claims, SECRET, { expiresIn: EXPIRES_IN, audience: AUDIENCE });
}

export function verifyMemberToken(token) {
  try {
    return jwt.verify(token, SECRET, { audience: AUDIENCE });
  } catch {
    return null;
  }
}

/** Authenticate a member request; responds 401 and returns null on failure. */
export function authenticateMember(req, res) {
  const header = req.headers?.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    unauthorized(res, 'Please sign in to continue.');
    return null;
  }
  const payload = verifyMemberToken(token);
  if (!payload) {
    unauthorized(res, 'Your session has expired. Please sign in again.');
    return null;
  }
  return payload;
}

export const normalizePhone = (p) => (p || '').replace(/[\s-]/g, '');

/**
 * Is this the member's phone, however it was typed?
 *
 * Registration stores phones internationally (+27821234567), and a member
 * types the number the way they say it (082 123 4567). Compared after
 * removing only spaces and dashes, those never matched: every KOM member who
 * typed their phone the local way was told "We could not find a matching
 * membership" — while the sign-in screen's own example showed the local form.
 *
 * Equal when the digits are equal, or when one is the national number with
 * its trunk 0 and the other is the same number behind a 1-3 digit country
 * code. Nothing looser: the membership number must still match exactly, and
 * this never widens which member a number can reach.
 */
export function phoneMatches(stored, typed) {
  const a = String(stored || '').replace(/\D/g, '');
  const b = String(typed || '').replace(/\D/g, '');
  if (!a || !b) return false;
  if (a === b) return true;

  // National significant number: the trunk 0 removed.
  const na = a.replace(/^0+/, '');
  const nb = b.replace(/^0+/, '');
  if (na === nb) return true;

  // One side carries a country code in front of the other's national number.
  const [longer, shorter] = na.length > nb.length ? [na, nb] : [nb, na];
  const prefix = longer.length - shorter.length;
  return shorter.length >= 7 && prefix >= 1 && prefix <= 3 && longer.endsWith(shorter);
}
