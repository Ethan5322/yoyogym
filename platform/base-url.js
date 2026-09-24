// The address emailed links point at.
//
// A link in an email must be ABSOLUTE. With PLATFORM_BASE_URL unset, the
// password-reset and activation emails carried "/platform/reset?token=…" — a
// path with no site in front of it, which no mail app can open.
//
// ============================================================================
// NEVER FROM THE REQUEST
// ============================================================================
//
// The obvious fallback — the Host header of the request that asked for the
// email — is a known attack ("password-reset poisoning"): anyone can send a
// reset request for a real owner with Host: attacker.example, and the owner
// receives a GENUINE email from us whose link hands their reset token to the
// attacker. So the fallback is Vercel's own system variables, which describe
// the deployment itself and cannot be set by a visitor.

/**
 * @param {object} env  process.env, passed in so tests need no environment
 * @returns {string} e.g. "https://yoyogym.vercel.app", no trailing slash; ''
 *   only when nothing at all is known (local development)
 */
export function platformBaseUrl(env = process.env) {
  const explicit = String(env.PLATFORM_BASE_URL || '').trim();
  if (explicit) return explicit.replace(/\/+$/, '');

  const https = (host) => (host ? `https://${String(host).replace(/^https?:\/\//, '').replace(/\/+$/, '')}` : '');

  // Production: the stable production address, not the per-build one.
  if (env.VERCEL_ENV === 'production') {
    return https(env.VERCEL_PROJECT_PRODUCTION_URL || env.VERCEL_URL);
  }
  // A preview: the branch address, which follows the branch, or this build's.
  return https(env.VERCEL_BRANCH_URL || env.VERCEL_URL);
}
