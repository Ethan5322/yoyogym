// "I forgot my password" — for platform accounts (gym owners and Yoyo staff).
//
// Before this, an owner who forgot their password had no way back in: no
// reset route existed, on the website or in the app. Their gym kept running,
// and they could not reach it. The stores require secure password recovery
// (store-compliance checklist), and so does anyone who has ever forgotten one.
//
//   >>> ONLY HASHES ARE STORED, AND A LINK WORKS ONCE, FOR ONE HOUR. <<<
//
// The same shape as activation (platform/activation.js), for the same
// reasons: a link sits in an inbox, gets forwarded and turns up in a mail
// provider's logs, so a stolen table must yield nothing usable and an old link
// must be dead.
//
// ============================================================================
// THE OWNER HAS TWO PASSWORDS IN EFFECT, AND A RESET SETS BOTH
// ============================================================================
//
// Activation creates the owner's account INSIDE their gym (username `owner`)
// with the same password as their platform login. Resetting only the platform
// one would let the owner back into the platform and leave them locked out of
// their own gym — the one place they actually needed to reach. So the gym
// account is updated first, through the same upsert activation uses.
//
// ============================================================================
// WHAT IT DOES NOT DO
// ============================================================================
//
// It does not skip two-factor authentication. Staff still need their code
// after resetting; a password reset is not an account-recovery bypass.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { hashPassword } from './auth.js';
import { MIN_PASSWORD_LENGTH } from './activation.js';

/** An hour: long enough to find the email, short enough that an old one is dead. */
export const RESET_TTL_MINUTES = 60;

/**
 * What the requester is told, WHETHER OR NOT THE ACCOUNT EXISTS.
 *
 * A different answer for a known email would turn this form into a way of
 * discovering which gyms' owners have accounts.
 */
export const REQUESTED =
  'If that email belongs to a Yoyo Gyms account, we have sent a link to reset the password. It works for one hour.';

const REFUSED = 'That reset link is not valid or has expired. Please ask for a new one.';

const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex');

function sameHash(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Create a reset. The raw token is returned once, to be sent, and never stored. */
export function issueReset({ userId, now = new Date() }) {
  const token = randomBytes(32).toString('hex');
  return {
    token,
    row: {
      user_id: userId,
      token_hash: sha256(token),
      expires_at: new Date(now.getTime() + RESET_TTL_MINUTES * 60_000).toISOString(),
      used_at: null,
    },
  };
}

/** Is this reset usable right now? Pure. Every refusal says the same thing. */
export function checkReset(record, token, now = new Date()) {
  if (!record || record.used_at) return { ok: false, reason: REFUSED };
  if (new Date(record.expires_at).getTime() <= now.getTime()) return { ok: false, reason: REFUSED };
  if (!sameHash(record.token_hash, sha256(token))) return { ok: false, reason: REFUSED };
  return { ok: true, userId: record.user_id };
}

/**
 * Ask for a reset link.
 *
 * @param {object} deps { findUserByEmail, saveReset, sendResetEmail, audit }
 * @returns {Promise<{message: string}>} the same message in every case
 */
export async function requestReset(deps, { email }, now = new Date()) {
  const address = String(email || '').trim().toLowerCase();
  const user = address ? await deps.findUserByEmail(address) : null;

  // A deactivated account is not reset: deactivation is a decision, and a
  // reset link must not quietly undo it.
  if (user && user.is_active !== false && user.password_hash) {
    // A failure here is swallowed and logged, NOT surfaced. This branch only
    // runs for accounts that exist, so an error page here — and only here —
    // would tell a stranger which emails are registered.
    try {
      const { row, token } = issueReset({ userId: user.id, now });
      await deps.saveReset(row);
      const sent = await deps.sendResetEmail({ to: user.email, token });

      await deps.audit({
        action: 'platform.password.reset_requested',
        actor_kind: 'system',
        actor_user_id: user.id,
        // Never the token. An audit log holding a working link grants access.
        detail: { emailed: Boolean(sent?.ok), reason: sent?.reason ?? null },
      });
    } catch (err) {
      console.error('password reset request failed:', err?.message);
    }
  }

  return { message: REQUESTED };
}

/**
 * Set a new password from a reset link.
 *
 * ORDER MATTERS, as in activation: validated and hashed first, the gym
 * account updated next, and only then is the link consumed — so a failure
 * part-way leaves the owner holding a link that still works.
 *
 * @param {object} deps { findReset, gymsOwnedBy, createGymAdmin, setPassword,
 *                        saveLoginState, markResetsUsed, audit }
 */
export async function completeReset(deps, { token, password }, now = new Date()) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: `Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.` };
  }

  const record = await deps.findReset(sha256(token));
  const check = checkReset(record, token, now);
  if (!check.ok) return check;

  const hash = await hashPassword(password);

  // The gym-side account first (see the header). An owner of no gym yet —
  // applied, not approved — simply has none to update.
  const gymIds = await deps.gymsOwnedBy(check.userId);
  for (const gymId of gymIds) {
    const updated = await deps.createGymAdmin({ gymId, userId: check.userId, password });
    if (updated === false) {
      return { ok: false, reason: 'We could not update your gym sign-in. Please try the link again in a minute.' };
    }
  }

  await deps.setPassword(check.userId, hash);
  // A reset also lifts a lockout. The person has just proved they own the
  // mailbox, which is a stronger proof than the password they forgot.
  await deps.saveLoginState(check.userId, { failed_logins: 0, locked_until: null });
  // EVERY open link for this account, not just this one: a second request
  // made in a panic should not leave a live link sitting in the inbox.
  await deps.markResetsUsed(check.userId, now.toISOString());

  await deps.audit({
    action: 'platform.password.reset',
    actor_kind: 'user',
    actor_user_id: check.userId,
    detail: { gym_accounts_updated: gymIds.length },
  });

  return { ok: true, userId: check.userId, gymAccountsUpdated: gymIds.length };
}

/** The hash a lookup keys on. */
export const resetLookupHash = sha256;
