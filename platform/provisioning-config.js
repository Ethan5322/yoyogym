// Is this server able to create a gym? Checked BEFORE anyone presses Approve.
//
// Approving records the decision first and provisions second, and a failed
// provision cannot be retried from the panel. So a missing setting that only
// surfaced at the first provisioning step — "Missing SUPABASE_PROJECT_REF" —
// left an application approved, with no gym, that could never be approved
// again. The same stranding D-155's fix removed for the switch being off.
//
// This reports every problem at once, by NAME only — never a value — so it is
// safe to show on the staff home page.

/**
 * @param {object} env  process.env, passed in so tests need no environment
 * @returns {{live: boolean, ready: boolean, problems: string[]}}
 */
export function provisioningReadiness(env = process.env) {
  const live = env.PLATFORM_PROVISION_LIVE === 'true';
  const problems = [];

  if (!live) {
    problems.push('PLATFORM_PROVISION_LIVE is not set to true, so creating gyms is switched off.');
    return { live, ready: false, problems };
  }

  const need = {
    SUPABASE_PROJECT_REF: 'the Supabase project ID (Project Settings → General)',
    SUPABASE_MANAGEMENT_TOKEN: 'a Supabase access token (Account → Access Tokens)',
    SUPABASE_URL: 'the Supabase project URL',
    SUPABASE_SERVICE_ROLE_KEY: 'the Supabase service role key',
  };
  for (const [name, what] of Object.entries(need)) {
    if (!String(env[name] || '').trim()) problems.push(`${name} is missing — ${what}.`);
  }

  // A real access token starts "sbp_". Anything else is most likely a
  // placeholder pasted by mistake, and would fail only at the first step.
  const token = String(env.SUPABASE_MANAGEMENT_TOKEN || '').trim();
  if (token && !token.startsWith('sbp_')) {
    problems.push('SUPABASE_MANAGEMENT_TOKEN does not look like a Supabase access token (they start with "sbp_").');
  }

  // A project ID is a short lowercase code, never a URL.
  const ref = String(env.SUPABASE_PROJECT_REF || '').trim();
  if (ref && !/^[a-z0-9]{10,40}$/.test(ref)) {
    problems.push('SUPABASE_PROJECT_REF does not look like a project ID (a short code of lowercase letters and digits, not a URL).');
  }

  return { live, ready: problems.length === 0, problems };
}
