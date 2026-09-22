// First run — turning the seeded owner row into an account that can sign in.
//
// The seed deliberately creates the platform owner with NO PASSWORD and NO
// 2FA, because a password typed into a SQL editor ends up in the clipboard,
// the query history and quite possibly a screenshot. This is where it gets
// set properly: hashed, with two-factor enabled in the same step, because a
// staff account cannot sign in without it (D-077).
//
// ============================================================================
// WHAT STOPS A STRANGER USING THIS
// ============================================================================
//
// Two things, and both are needed.
//
//   1. A SETUP TOKEN from the environment. Whoever can set an environment
//      variable on the deployment already controls it, so that is a real
//      trust root rather than a pretend one. No token configured means the
//      route does not work at all.
//
//   2. THE ACCOUNT MUST HAVE NO PASSWORD YET. This is the part that matters
//      most: it makes setup a one-time act that cannot be replayed. Even
//      somebody holding the token cannot use this to reset a working
//      account's password, because the moment a password exists the route
//      refuses. It is not a back door left ajar; it closes behind itself.
import { hashPassword, generateTotpSecret, otpauthUri, verifyTotp, base32Decode, generateRecoveryCodes } from './auth.js';
import { timingSafeEqual } from 'node:crypto';

export const MIN_PASSWORD_LENGTH = 12;

/** One message for every refusal, so this cannot be used to probe accounts. */
const REFUSED = 'This setup link is not valid.';

function sameToken(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Is setup available at all, and is this the right token? */
export function setupAllowed(token) {
  const expected = process.env.PLATFORM_SETUP_TOKEN || '';

  // No token configured means no setup route. Failing closed here is the
  // difference between a first-run flow and an open password reset.
  if (!expected) return { ok: false, reason: 'Setup is not enabled.' };
  if (!sameToken(token, expected)) return { ok: false, reason: REFUSED };

  return { ok: true };
}

/**
 * Begin setup: check the account is genuinely unclaimed and mint a 2FA secret.
 *
 * @returns {{ok: true, secret, otpauth, user} | {ok: false, reason}}
 */
export function beginSetup(user) {
  if (!user) return { ok: false, reason: REFUSED };

  // THE ONE-TIME GUARD. An account that already has a password is a working
  // account, and this route must never be a way to take one over.
  if (user.password_hash) {
    return {
      ok: false,
      reason: 'This account is already set up. Use the sign-in page, or reset the password from there.',
    };
  }

  if (user.kind !== 'platform_staff') {
    // Gym owners are set up by their activation link, which is tied to their
    // gym. This route is only for the platform's own staff.
    return { ok: false, reason: REFUSED };
  }

  const secret = generateTotpSecret();
  return {
    ok: true,
    secret,
    otpauth: otpauthUri({ secret, account: user.email }),
    user,
  };
}

/**
 * Finish setup: set the password, turn 2FA on, and hand over recovery codes.
 *
 * The TOTP code is verified BEFORE anything is written. Enabling two-factor
 * without proving the authenticator works would lock the only owner account
 * out of the platform on its first day, with no second account to fix it from.
 */
export async function completeSetup(deps, { user, secret, password, totp } = {}) {
  const guard = beginSetup(user);
  if (!guard.ok) return guard;

  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: `Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.` };
  }

  if (!secret || !verifyTotp(base32Decode(secret), String(totp || ''))) {
    return {
      ok: false,
      reason: 'That code did not match. Check your authenticator app and try the next code.',
    };
  }

  const { codes, hashes } = await generateRecoveryCodes();
  const hash = await hashPassword(password);

  await deps.finishSetup(user.id, {
    password_hash: hash,
    totp_secret: secret,
    totp_enabled: true,
    recovery_code_hashes: hashes,
    updated_at: new Date().toISOString(),
  });

  await deps.audit({
    action: 'platform.owner.setup_completed',
    actor_user_id: user.id,
    entity: 'platform_user',
    entity_id: user.id,
    // Never the secret, never a recovery code — this log is readable in the panel.
    detail: { email: user.email },
  });

  // Returned ONCE. Only hashes are stored, so this is the only moment these
  // exist anywhere.
  return { ok: true, recoveryCodes: codes };
}
