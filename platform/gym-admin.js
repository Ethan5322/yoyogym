// The gym owner's account INSIDE their own gym.
//
// ---------------------------------------------------------------------------
// The gap this closes
// ---------------------------------------------------------------------------
//
// Provisioning created the gym's schema and seeded its profile, and left a
// comment saying the owner's admin account "is created by the existing seed
// script at handover". That script (`scripts/seed-owner.js`) is run by a human
// on a laptop, against one `.env`, with a password that human invents and then
// has to transmit to the owner somehow.
//
// At one gym that is a chore. At ten thousand it is not a handover at all, and
// it means the finished onboarding flow ended with an owner who had a platform
// account, a provisioned gym, and NO WAY INTO IT.
//
// So the account is created at activation instead — the one moment the system
// legitimately holds a password the owner chose and has just confirmed.
//
// ---------------------------------------------------------------------------
// Why the owner's platform password and their gym password are the same
// ---------------------------------------------------------------------------
//
// They are two accounts in two separate stores, with two separate hashes, and
// neither token is accepted by the other system (platform tokens carry
// `aud: "platform"`, and the keys differ). What they share is the string the
// owner typed once.
//
// The alternative is a generated password emailed in clear text, or a second
// password chosen at a second time. Both are worse: one puts a working
// credential in an inbox, the other is the step everybody forgets.
//
// The owner can change it from their gym's own settings afterwards, and that
// change does not touch their platform login.
import bcrypt from 'bcryptjs';

/**
 * The username the owner signs into their gym with.
 *
 * Not their email: the existing gym login is by USERNAME (§8), and the
 * existing seed script has always used this one. Changing the shape now would
 * mean two kinds of gym owner.
 */
export const OWNER_USERNAME = 'owner';

const ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);

/**
 * The row that goes into `<gym schema>.admin_users`.
 *
 * Hashed HERE rather than reusing the platform hash: the two stores are
 * separate on purpose, and a hash copied between them is a link between them.
 *
 * `role: 'owner'` is the existing top gym role (§8) — it unlocks Settings and
 * Staff, which is how the owner then adds their manager and reception.
 */
export async function gymOwnerAccount({ email, fullName, password }) {
  if (!password || typeof password !== 'string') {
    throw new Error('A password is required to create the gym owner account.');
  }

  return {
    username: OWNER_USERNAME,
    email: (email || '').trim().toLowerCase() || null,
    password_hash: await bcrypt.hash(password, ROUNDS),
    full_name: (fullName || '').trim() || 'Gym Owner',
    role: 'owner',
    is_active: true,
  };
}

/**
 * Where the owner signs into their gym.
 *
 * Derived from the gym's own slug, so every gym has its own address and no
 * environment variable decides it. The previous implementation read a single
 * `PLATFORM_GYM_ADMIN_URL` — one value, on a platform built for ten thousand
 * gyms, and unset everywhere, which meant an ACTIVE gym's owner was shown
 * "Your gym is not open yet."
 */
export function gymAdminPath(slug) {
  return `/g/${encodeURIComponent(String(slug || ''))}/admin/login`;
}
