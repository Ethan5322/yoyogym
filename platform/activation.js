// Owner activation — the link and the code (§17).
//
// After an application is approved and the gym is provisioned, the owner gets
// an email with a link and a six-digit code. Both are required. The link alone
// is not enough, because a link sits in an inbox, gets forwarded, and turns up
// in a mail provider's logs; the code is typed by the person who received it.
//
//   >>> ONLY HASHES ARE STORED. <<<
//
// The raw token and code are returned exactly once, at issue, to be sent. A
// stolen copy of platform.owner_activations yields nothing usable — the same
// reason passwords are not stored in plaintext.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { hashPassword } from './auth.js';
import { OWNER_USERNAME } from './gym-admin.js';

/** How long an activation link lives. Long enough to find the email; not a week. */
export const ACTIVATION_TTL_HOURS = 48;

/** The shortest owner password we will accept. Matches the signup form. */
export const MIN_PASSWORD_LENGTH = 10;

/**
 * One message for every failure.
 *
 * "No such token", "wrong code" and "expired" are all the same sentence, so
 * the endpoint cannot be used to discover which tokens exist or which have
 * already been used.
 */
const REFUSED = 'That activation link is not valid. Please ask for a new one.';

const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex');

/** Constant-time compare that returns false instead of throwing on a length mismatch. */
function sameHash(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Create an activation.
 *
 * @returns {{row: object, token: string, code: string}}
 *          `row` is what is stored; `token` and `code` are what is sent, and
 *          are never recoverable from `row` afterwards.
 */
export function issueActivation({ userId, gymId, now = new Date() }) {
  // 32 random bytes. A token short enough to be guessed is not a secret, and
  // this one is the first half of the only credential the owner has.
  const token = randomBytes(32).toString('hex');

  // Six digits, uniformly drawn. The link carries the entropy; the code exists
  // to prove the person holding the link is the person the email was sent to.
  const code = String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, '0');

  return {
    token,
    code,
    row: {
      user_id: userId,
      gym_id: gymId,
      token_hash: sha256(token),
      code_hash: sha256(code),
      expires_at: new Date(now.getTime() + ACTIVATION_TTL_HOURS * 3_600_000).toISOString(),
      used_at: null,
    },
  };
}

/**
 * Is this token-and-code pair good, right now?
 *
 * Pure: no database, no clock. Every refusal carries the same reason.
 */
export function checkActivation(record, { token, code } = {}, now = new Date()) {
  if (!record) return { ok: false, reason: REFUSED };

  // Used before anything else: a consumed link is dead even if it has not yet
  // expired, and even if both halves are correct.
  if (record.used_at) return { ok: false, reason: REFUSED };

  if (new Date(record.expires_at).getTime() <= now.getTime()) {
    // The one refusal that says something different, because "expired" is
    // actionable — the owner asks for a new link — and knowing a link once
    // existed reveals nothing to someone who already held it.
    return { ok: false, reason: 'That activation link has expired. Please ask for a new one.' };
  }

  // Both halves, both constant-time. Evaluated without short-circuiting so the
  // work done does not depend on which half was wrong.
  const tokenOk = sameHash(record.token_hash, sha256(token));
  const codeOk = sameHash(record.code_hash, sha256(code));
  if (!(tokenOk && codeOk)) return { ok: false, reason: REFUSED };

  return { ok: true, userId: record.user_id, gymId: record.gym_id };
}

/**
 * Carry out an activation: set the owner's password and consume the link.
 *
 * ORDER MATTERS. The password is validated and hashed before anything is
 * marked used, so a typo does not burn the owner's only link and leave them
 * asking support for a new one.
 *
 * @param {object} deps    { findActivation, setPassword, markUsed, setGymStatus,
 *                           createGymAdmin, audit }
 * @param {object} input   { token, code, password }
 * @param {object} [opts]
 * @param {boolean} [opts.activatesGym=true]  Opening the gym is the point (D-124);
 *   pass false only when the caller has a reason not to.
 */
export async function completeActivation(deps, { token, code, password } = {}, opts = {}) {
  const now = opts.now ?? new Date();

  // Q-46 ANSWERED (D-124): verifying the owner's email opens the gym. Paying
  // is not what opens the doors — D-049 is superseded, because under it a
  // trialing gym was refused by tenancy resolution and "30 days free" was a
  // promise the system could not keep.
  //
  // Still an argument rather than a constant, because the caller sometimes
  // has a reason not to open a gym on activation — reactivating a suspended
  // owner's account, for one — and a constant would take that choice away.
  const activatesGym = opts.activatesGym !== false;

  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: `Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.` };
  }

  const record = await deps.findActivation(sha256(token));
  const check = checkActivation(record, { token, code }, now);
  if (!check.ok) return { ok: false, reason: check.reason };

  // Hashed before the link is consumed: if bcrypt throws, the owner still has
  // a working link.
  const hash = await hashPassword(password);

  // THE OWNER'S ACCOUNT INSIDE THEIR OWN GYM, created here because this is the
  // only moment the system holds a password they chose.
  //
  // Before the link is consumed, deliberately. If this write fails the owner
  // still has a working link and can try again — whereas failing AFTER would
  // leave them activated, unable to get into their gym, and out of links.
  // The owner's name and email are looked up by the dep rather than passed
  // through here: this module knows about tokens and codes, not about where a
  // gym's schema lives or what a platform user row looks like.
  let gymAdminCreated = false;
  if (typeof deps.createGymAdmin === 'function') {
    const seeded = await deps.createGymAdmin({
      gymId: check.gymId,
      userId: check.userId,
      password,
    });

    if (seeded === false) {
      return {
        ok: false,
        reason: 'We could not finish setting up your gym. Please try that link again in a minute.',
      };
    }
    gymAdminCreated = true;
  }

  await deps.setPassword(check.userId, hash);
  await deps.markUsed(record.id, now.toISOString());

  let gymActivated = false;
  if (activatesGym) {
    await deps.setGymStatus(check.gymId, 'active');
    gymActivated = true;
  }

  await deps.audit({
    action: 'platform.owner.activated',
    actor_kind: 'gym_owner',
    actor_user_id: check.userId,
    entity: 'gym',
    entity_id: check.gymId,
    // Recorded rather than assumed: if the gym account was NOT created, that
    // is the fact somebody needs when the owner writes in saying they cannot
    // sign in to their own gym.
    detail: { gym_activated: gymActivated, gym_admin_created: gymAdminCreated },
  });

  return {
    ok: true,
    userId: check.userId,
    gymId: check.gymId,
    gymActivated,
    gymAdminCreated,
    // Handed back so the success page can TELL the owner how to sign in. A
    // credential created and never mentioned is a credential nobody uses.
    gymUsername: gymAdminCreated ? OWNER_USERNAME : null,
  };
}

/** The hash a lookup keys on, so the caller never has to know how it is derived. */
export const activationLookupHash = sha256;
