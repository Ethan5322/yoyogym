// Signing in to the platform — ONE decision, called by both doors.
//
// ============================================================================
// Why this file exists
// ============================================================================
//
// The website (router.js) and the app (api.js) each carried their own copy of
// the sign-in rule. They agreed on 2FA, and they agreed on something worse:
// neither counted a failure. platform_users has had failed_logins and
// locked_until since the schema was written, commented "mirrors the gym admin
// hardening: 5 attempts -> 15 minute lock", and nothing ever read or wrote
// either column.
//
// A gym owner signs in with a password alone — 2FA is optional for them — and
// that password reaches their gym's admin panel and every member in it. With
// no lockout it could be guessed at whatever rate the attacker liked, through
// either door.
//
// So the rule lives here once, and a door can no longer be the weaker one.

/** Same numbers as the gym admin login (server/handlers/auth/login.js). */
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;

export const INVALID = 'Invalid email, password or authentication code.';
export const LOCKED = 'Too many failed attempts. This account is locked for 15 minutes.';

/** Is this account inside a lock window right now? */
export function isLocked(user, now = new Date()) {
  return Boolean(user?.locked_until && new Date(user.locked_until) > now);
}

/**
 * What to store after a failed attempt.
 *
 * The counter resets when the lock is set, exactly as the gym side does, so a
 * lock that expires gives a fresh five rather than locking again on the next
 * typo.
 */
export function afterFailure(user, now = new Date()) {
  const attempts = (Number(user?.failed_logins) || 0) + 1;
  if (attempts >= MAX_FAILED_LOGINS) {
    return { failed_logins: 0, locked_until: new Date(now.getTime() + LOCK_MINUTES * 60_000).toISOString() };
  }
  return { failed_logins: attempts };
}

/** What to store after a success. */
export const AFTER_SUCCESS = Object.freeze({ failed_logins: 0, locked_until: null });

/**
 * Decide a sign-in attempt.
 *
 * @returns {Promise<{outcome: 'ok'|'needs2fa'|'locked'|'invalid', user: object|null}>}
 *   The caller turns the outcome into HTML or JSON and writes the audit entry;
 *   everything that DECIDES is here.
 */
export async function decideLogin(deps, { email, password, totp }, now = new Date()) {
  const user = await deps.findUserByEmail(String(email || '').trim().toLowerCase());

  if (!user || user.is_active === false) return { outcome: 'invalid', user: null };

  // Checked BEFORE the password. A correct guess during the lock must not
  // succeed, or the lock only slows down the wrong guesses.
  if (isLocked(user, now)) return { outcome: 'locked', user };

  const passwordOk = await deps.verifyPassword(password, user.password_hash);

  // WHO NEEDS A SECOND FACTOR, and why it is not "everyone".
  //
  // A gym owner reaches ONE gym — their own. Platform staff reach EVERY gym on
  // the platform, which is why D-077 makes 2FA mandatory for them and why a
  // correct password alone must never be enough.
  //
  // Anything that is not explicitly a gym owner is treated as staff, so a
  // mistyped or unrecognised `kind` in the database produces the STRICTER
  // rule, never the weaker one.
  let ok = false;
  if (user.kind === 'gym_owner') {
    // Optional, but not decorative: an owner who has turned 2FA on must use
    // it, or the setting would be a lie.
    const secondOk = user.totp_enabled ? await deps.verifySecondFactor(user, totp) : true;
    ok = Boolean(passwordOk && secondOk);
  } else if (!user.totp_enabled) {
    // Staff without 2FA cannot sign in at all. Half-finished setup is the
    // situation the rule exists for, not an exception to it. Not counted as a
    // failure: the password was right, and locking the account would stop the
    // person finishing the setup the message tells them to finish.
    if (passwordOk) return { outcome: 'needs2fa', user };
  } else {
    ok = Boolean(passwordOk && (await deps.verifySecondFactor(user, totp)));
  }

  if (!ok) {
    await deps.saveLoginState(user.id, afterFailure(user, now));
    return { outcome: 'invalid', user };
  }

  // Only written when there is something to clear — a successful sign-in is
  // the common case and should not cost a write every time.
  if (user.failed_logins || user.locked_until) await deps.saveLoginState(user.id, AFTER_SUCCESS);
  return { outcome: 'ok', user };
}
