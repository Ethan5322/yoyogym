// Per-gym numbers for the main panel (D-130, decided by the user 2026-09-22).
//
// CLAUDE.md §16 asks the main panel to show aggregate gym statistics. D-044
// says platform staff must never see a gym's member data. Both are right, and
// the resolution the user chose is: COUNTS ONLY, NEVER NAMES.
//
// ============================================================================
// THE SAFETY IS STRUCTURAL, NOT A PROMISE
// ============================================================================
//
// Every query here uses PostgREST's `head: true` with an exact count. That is
// not a convention — it changes what the database sends back. The server
// returns the count in a header and NO ROWS AT ALL. There is no array of
// members to accidentally log, serialise into a page, or return from a
// function that later grows a new caller.
//
// A reviewer checking this file does not have to audit what happens to the
// rows. There are no rows.
//
// The one exception is `lastActivityAt`, which reads a single timestamp column
// by name. A timestamp is not personal data, and the column list is fixed in
// this file rather than passed in — so no caller can widen it.
//
// ============================================================================
// WHY THE PLATFORM NEEDS THESE AT ALL
// ============================================================================
//
// Plan limits are counted in members (§18.2). Without a count, the panel
// cannot see a Basic gym that has quietly grown to three hundred members, and
// cannot tell an owner they have outgrown their plan — which is the
// conversation that earns the upgrade. It is also how a gym that has stopped
// being used becomes visible before its renewal, rather than after.

/**
 * The only columns this module will ever read. Fixed here, never passed in.
 *
 * `checked_in_at`, NOT `created_at`: gym.checkins has no created_at column, so
 * "check-ins this month" and "last activity" were blank for every gym from the
 * day they were built. PostgREST returns an error object rather than
 * throwing, and the blank read as "reachable, no figures".
 */
export const READABLE_COLUMNS = Object.freeze(['checked_in_at']);

/**
 * Columns that must never appear in a query from the platform.
 *
 * Listed explicitly so the intent survives somebody rewriting this file, and
 * so a test can assert it rather than trusting a comment.
 */
export const FORBIDDEN_COLUMNS = Object.freeze([
  'full_name',
  'phone',
  'email',
  'id_number',
  'passport_number',
  'date_of_birth',
  'address_street',
  'face_descriptor',
  'arcface_embedding',
  'arcface_templates',
  'photo_url',
  'medical_aid_provider',
  'injuries_notes',
]);

const startOfMonth = (now) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

/**
 * Count things in one gym, without reading anything about anybody.
 *
 * @param {object} client a Supabase client already scoped to the gym's schema
 * @param {object} options { now }
 * @returns {Promise<{activeMembers, checkinsThisMonth, lastActivityAt, reachable}>}
 */
export async function gymStats(client, { now = new Date() } = {}) {
  const empty = {
    activeMembers: null,
    checkinsThisMonth: null,
    lastActivityAt: null,
    reachable: false,
  };

  if (!client) return empty;

  try {
    const [members, checkins, last] = await Promise.all([
      // head: true — the count comes back in a header and NO ROWS are sent.
      client.from('members').select('*', { count: 'exact', head: true }).eq('status', 'active'),

      client
        .from('checkins')
        .select('*', { count: 'exact', head: true })
        .gte('checked_in_at', startOfMonth(now)),

      // The one query that returns a row, and it is one timestamp.
      client
        .from('checkins')
        .select(READABLE_COLUMNS.join(','))
        .order('checked_in_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    // A query that failed is not a count of nothing. Reported as "could not
    // read", which the screen says, rather than blank figures beside a gym
    // that looks fine.
    if (members?.error || checkins?.error || last?.error) return empty;

    return {
      activeMembers: Number.isFinite(members?.count) ? members.count : null,
      checkinsThisMonth: Number.isFinite(checkins?.count) ? checkins.count : null,
      lastActivityAt: last?.data?.checked_in_at ?? null,
      reachable: true,
    };
  } catch {
    // A gym whose schema cannot be reached is a fact worth showing, not an
    // error that should take down the registry page. `reachable: false` is
    // what the screen renders.
    return empty;
  }
}

/**
 * Is this gym over what its plan allows?
 *
 * Returned as a fact, not an enforcement: nothing is blocked here. The gym
 * app already refuses NEW registrations over the limit (D-101), and an
 * existing member is never removed by a plan change (D-102). This is so the
 * panel can start the upgrade conversation.
 */
export function overPlanLimit(activeMembers, plan) {
  const limit = plan?.max_active_members;

  // A COUNT WE DO NOT HAVE IS NOT ZERO. `Number(null)` is 0 and
  // `Number.isFinite(0)` is true, so a looser check here would report a gym
  // whose schema could not be reached as "0 members, comfortably within its
  // plan" — a confident answer about a gym nobody could see.
  if (typeof activeMembers !== 'number' || !Number.isFinite(activeMembers)) return null;
  if (typeof limit !== 'number' || !Number.isFinite(limit)) return null;

  const over = activeMembers > limit;
  return {
    over,
    activeMembers,
    limit,
    // Said plainly, because the first thing an owner asks is whether their
    // members have been cut off.
    note: over
      ? 'Existing members are unaffected. Only new registrations are blocked until the plan changes.'
      : null,
  };
}
