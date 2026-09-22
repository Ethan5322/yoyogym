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
