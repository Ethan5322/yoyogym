// POST /api/auth/owner-login  { email, password, remember } -> { token, user, gym }
//
// A gym OWNER signs in with the email they applied with and their password —
// no searching for the gym first (CLAUDE.md §43.1 Q2). The app used to ask
// them to pick their gym, then sign in to it.
//
// THE PASSWORD IS ALWAYS CHECKED BY THE GYM. The registry only answers "which
// open gyms does this email own"; each of those gyms then runs its own,
// unchanged sign-in (attemptLogin) against its own account — lockout, disabled
// accounts and failed-attempt counting included. The Yoyo account's password
// is never consulted, so an owner who changed their gym password in Settings
// signs in with the gym password, as they would at the gym's own page.
//
// Every failure reads the same, so the endpoint cannot be used to learn which
// emails own a gym. Staff have no Yoyo account and keep choosing their gym.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, unauthorized, serverError } from '../../lib/http.js';
import { rateLimit } from '../../lib/ratelimit.js';
import { resolveGym, runWithGym } from '../../lib/tenancy.js';
import { attemptLogin } from './login.js';

const INVALID = 'Invalid email or password';

export default async function ownerLogin(req, res, { tenancy } = {}) {
  if (!allowMethods(req, res, ['POST'])) return;
  if (!(await rateLimit(req, res, { key: 'owner-login', limit: 10, windowMs: 60_000 }))) return;

  try {
    const { email, password, remember } = await readJsonBody(req);
    const address = String(email || '').trim().toLowerCase();
    if (!address.includes('@') || !password) {
      return badRequest(res, 'Your email and password are required');
    }

    const deps = tenancy ?? (await import('../../lib/tenancy-deps.js')).tenancyDeps();
    const slugs = await deps.ownerGymSlugs(address);

    for (const slug of slugs) {
      let resolved;
      try {
        resolved = await resolveGym(slug, deps);
      } catch {
        continue; // a gym that cannot be served right now is not this owner's way in
      }
      const result = await runWithGym(resolved, () =>
        attemptLogin(getSupabase(), address, password, { remember: remember === true })
      );
      if (result.ok) {
        return ok(res, {
          token: result.token,
          user: result.user,
          gym: { slug, name: resolved.gym?.search_name || slug },
        });
      }
      // Found and locked or disabled: said, because it is what they need to know.
      if (result.final) return unauthorized(res, result.message);
    }

    return unauthorized(res, INVALID);
  } catch (err) {
    console.error('owner login error:', err.message);
    return serverError(res, 'Sign-in failed. Please try again.');
  }
}
