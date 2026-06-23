// Admin authentication helpers: password hashing/verification (bcrypt),
// JWT signing/verification, and request authentication + role guarding (RBAC).
//
// Roles (spec Part 4.1):
//   owner     — full access
//   manager   — full access except settings
//   reception — verify, check-in, class booking
//   trainer   — view own clients only
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { unauthorized, forbidden } from './http.js';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);

if (!JWT_SECRET) {
  throw new Error('Missing JWT_SECRET environment variable.');
}

export const ROLES = ['owner', 'manager', 'reception', 'trainer'];

export async function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

/** Sign a JWT for an authenticated admin user. */
export function signToken(adminUser) {
  return jwt.sign(
    {
      sub: adminUser.id,
      username: adminUser.username,
      role: adminUser.role,
      full_name: adminUser.full_name,
      trainer_id: adminUser.trainer_id || null,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/** Verify a token string. Returns the decoded payload or null. */
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

/** Extract a bearer token from the Authorization header. */
function getBearer(req) {
  const header = req.headers?.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme === 'Bearer' && token) return token;
  return null;
}

/**
 * Authenticate a request. On success returns the decoded admin payload.
 * On failure responds 401 and returns null.
 */
export function authenticate(req, res) {
  const token = getBearer(req);
  if (!token) {
    unauthorized(res, 'Missing authentication token');
    return null;
  }
  const payload = verifyToken(token);
  if (!payload) {
    unauthorized(res, 'Invalid or expired session');
    return null;
  }
  return payload;
}

/**
 * Authenticate AND require one of the given roles.
 * Returns the admin payload, or null after sending 401/403.
 *
 * Usage:
 *   const admin = requireRole(req, res, ['owner', 'manager']);
 *   if (!admin) return;
 */
export function requireRole(req, res, allowedRoles) {
  const admin = authenticate(req, res);
  if (!admin) return null;
  if (allowedRoles && allowedRoles.length && !allowedRoles.includes(admin.role)) {
    forbidden(res, 'You do not have permission to perform this action');
    return null;
  }
  return admin;
}
