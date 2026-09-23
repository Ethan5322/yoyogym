// Your own account — the one screen that exists so losing a phone is not fatal.
//
// Recovery codes are issued once, at setup, and stored only as hashes. That is
// the right design: nobody, including us, can show them to you again. It is
// also a trap if you did not write them down, because the platform owner is
// the only account that can reach every gym, and there is no second owner to
// let you back in.
//
// So: new codes can be minted. The old ones stop working the moment they are.
//
// ============================================================================
// WHY THIS ASKS FOR YOUR PASSWORD AGAIN
// ============================================================================
//
// A signed-in session is not enough. Recovery codes bypass two-factor
// authentication by design — that is what they are for — so minting a fresh
// set from a stolen session would hand somebody a permanent way back in that
// survives changing the password AND re-doing 2FA.
//
// Re-authenticating turns a borrowed browser tab into something that needs the
// password and the authenticator as well. That is the whole point of asking.
import { generateRecoveryCodes } from './auth.js';

/**
 * Mint a fresh set of recovery codes.
 *
 * @param {object} deps  { verifyPassword, verifySecondFactor, saveRecoveryCodes, audit }
 * @param {object} input { user, password, totp }
 */
export async function regenerateRecoveryCodes(deps, { user, password, totp } = {}) {
  if (!user) return { ok: false, reason: 'Not signed in.' };

  // BOTH factors, the same two a sign-in needs. One generic message, because
  // saying which half was wrong tells an attacker which half to work on.
  const passwordOk = await deps.verifyPassword(password, user.password_hash);
  const secondOk = passwordOk && (await deps.verifySecondFactor(user, totp));

  if (!passwordOk || !secondOk) {
    await deps.audit({
      action: 'platform.recovery_codes.refused',
      actor_user_id: user.id,
      // Worth seeing in the security screen: somebody trying to mint recovery
      // codes and failing is not ordinary activity.
      detail: { reason: 'reauthentication failed' },
    });
    return { ok: false, reason: 'That password or code was not right.' };
  }

  const { codes, hashes } = await generateRecoveryCodes();

  // REPLACES, never appends. Any code written on a piece of paper somewhere
  // stops working now — which is the point if the reason for doing this is
  // that the old list went missing.
  await deps.saveRecoveryCodes(user.id, hashes);

  await deps.audit({
    action: 'platform.recovery_codes.regenerated',
    actor_user_id: user.id,
    entity: 'platform_user',
    entity_id: user.id,
    // Never a code, never a hash — this log is readable in the panel.
    detail: { count: codes.length },
  });

  // Shown once. Only hashes are stored, so this really is the only moment.
  return { ok: true, codes };
}

/** How many unused codes remain, for the account screen to show. */
export function remainingCodes(user) {
  const hashes = user?.recovery_code_hashes;
  return Array.isArray(hashes) ? hashes.length : 0;
}
