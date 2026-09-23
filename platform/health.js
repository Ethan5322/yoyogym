// A diagnostic that answers "why can the app not see what SQL Editor can see?"
//
// This exists because of a real afternoon lost on 2026-09-22. The owner row
// was correct in the database — right email, right kind, active — and the
// setup screen still said no such account existed. The SQL Editor talks to
// Postgres directly; the app talks through PostgREST with a key. Everything
// that can differ between those two paths is invisible from either end.
//
// Two failures in particular look identical from outside:
//
//   · `platform` is not in the exposed-schemas list, so PostgREST refuses
//     the request entirely
//   · the key is the ANON key rather than the service key, so RLS — which is
//     on, with no policies — denies everything and returns ZERO ROWS AND NO
//     ERROR, which is indistinguishable from an empty table
//
// The second is the nastier one, because nothing anywhere reports a problem.
//
// ============================================================================
// WHAT THIS DELIBERATELY DOES NOT DO
// ============================================================================
//
// It never returns a key, or any part of one. It reports the `role` claim
// inside the key — a Supabase key is a JWT whose payload says `anon` or
// `service_role` — which is the one fact needed to tell these two cases apart
// and is not itself a secret.
//
// It is guarded by the setup token, so it is not a public description of your
// infrastructure.

/**
 * Read the role out of a Supabase key WITHOUT verifying it.
 *
 * Unverified on purpose: this is not authentication, it is a label. The
 * question is "which key did somebody paste into the environment", and the
 * payload answers it. Nothing is trusted on the strength of this.
 */
export function keyRole(key) {
  const parts = String(key || '').split('.');
  if (parts.length !== 3) return key ? 'not-a-jwt' : 'missing';

  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return payload.role || 'unknown';
  } catch {
    return 'unreadable';
  }
}

/**
 * Check every link in the chain, and say which one is broken.
 *
 * @param {object} deps { countUsers, env }
 */
export async function platformHealth(deps) {
  const env = deps.env || process.env;

  const checks = [];
  const add = (name, ok, detail, fix = null) => checks.push({ name, ok, detail, fix });

  // ---- 1. is there a database to talk to at all ---------------------------
  const url = env.PLATFORM_SUPABASE_URL || env.SUPABASE_URL;
  add('Database URL', Boolean(url), url ? 'set' : 'missing',
      url ? null : 'Set PLATFORM_SUPABASE_URL (or SUPABASE_URL) and redeploy.');

  // ---- 2. WHICH KEY -------------------------------------------------------
  const key = env.PLATFORM_SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  const role = keyRole(key);
  const keyOk = role === 'service_role';

  add(
    'Supabase key role', keyOk, role,
    keyOk
      ? null
      : role === 'anon'
        ? 'This is the ANON key, not the service key. Row level security is on with no policies, so the anon role is denied everything and every query returns zero rows WITH NO ERROR — which looks exactly like an empty database. Copy the service_role key from Settings -> API instead, then redeploy.'
        : 'Expected a service_role key. Copy it from Supabase Settings -> API (service_role, not anon), then redeploy.'
  );

  // ---- 3. can PostgREST actually serve the platform schema ----------------
  let users = null;
  let readError = null;
  try {
    users = await deps.countUsers();
  } catch (err) {
    // Everything, in order of usefulness. `String(err)` alone gives "Error"
    // when the message is empty, which is worse than useless on a page whose
    // only job is to say what went wrong.
    readError =
      err?.message ||
      (err && typeof err === 'object' ? JSON.stringify(err) : null) ||
      String(err);
  }

  if (readError) {
    add('Read platform.platform_users', false, readError,
        /schema/i.test(readError)
          ? 'Add `platform` to Supabase Settings -> API -> Exposed schemas. ADD it to the list — do not replace it, or the gym schema stops being served.'
          : 'The query failed. The message above is from the database itself.');
  } else if (users === 0) {
    // The trap. No error, no rows — and the cause is usually the key.
    add('Read platform.platform_users', false, '0 rows, and no error',
        'The query ran and returned nothing. If the seed has been run, this is almost certainly the key: with the anon key, RLS denies every row and reports no error. Check the key role above.');
  } else {
    add('Read platform.platform_users', true, `${users} platform user(s) visible`);
  }

  // ---- 4. the platform's own secrets --------------------------------------
  const jwt = env.PLATFORM_JWT_SECRET;
  add('PLATFORM_JWT_SECRET', Boolean(jwt), jwt ? 'set' : 'missing',
      jwt ? null : 'Required. Signing refuses without it.');

  if (jwt && env.JWT_SECRET && jwt === env.JWT_SECRET) {
    add('Platform secret is distinct', false, 'identical to JWT_SECRET',
        'The platform must not share the gym signing key - a platform session would be accepted by the gym API. Generate a different one.');
  }

  add('PLATFORM_SETUP_TOKEN', Boolean(env.PLATFORM_SETUP_TOKEN), env.PLATFORM_SETUP_TOKEN ? 'set' : 'missing',
      env.PLATFORM_SETUP_TOKEN ? null : 'Needed only for first-run setup. Remove it once you have signed in.');

  return { ok: checks.every((c) => c.ok), checks };
}
