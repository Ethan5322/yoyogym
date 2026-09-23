// Filing a new member in the platform's routing index.
//
// When somebody registers at a gym, one row is written on the platform side so
// that "I do not remember which gym I joined" can find them later. Without it
// that recovery path searches an empty table and every member is told their
// details do not match.
//
// ============================================================================
// WHY THIS IS NOT AN IMPORT FROM platform/
// ============================================================================
//
// D-081 forbids server/ and platform/ importing each other. This does not
// import anything from platform/ — it writes to a table the platform owns,
// with its own client, exactly as server/lib/tenancy-deps.js already reads
// platform.gyms to resolve a tenant. A data access is not a dependency.
//
// The hashing comes from shared/, which is the common ground both sides are
// allowed to use, so registration and lookup cannot compute the digest
// differently.
//
// ============================================================================
// IT NEVER FAILS A REGISTRATION
// ============================================================================
//
// A member who has just completed a 38-step signup, paid, and had their
// membership created must not see an error because a convenience index could
// not be written. Every failure here is logged and swallowed. The cost of
// losing a row is that one member cannot use a shortcut; the cost of throwing
// is a registration that looks broken after it succeeded.
import { createClient } from '@supabase/supabase-js';
import { directoryRow } from '../../shared/member-directory.js';

let _client = null;

function platformClient() {
  if (_client) return _client;

  const url = process.env.PLATFORM_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.PLATFORM_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'platform' },
  });
  return _client;
}

/**
 * Record a member in the routing index.
 *
 * @param {object} args { membershipNumber, phone, gymSlug }
 * @returns {Promise<{ok: boolean, reason?: string}>} — never throws.
 */
export async function indexMember({ membershipNumber, phone, gymSlug }) {
  try {
    // Single-gym mode: no gym in scope, so there is nothing to route to and
    // nothing to file. The existing deployment writes no rows and behaves
    // exactly as it always has.
    if (!gymSlug) return { ok: false, reason: 'no_gym_in_scope' };

    const db = platformClient();
    if (!db) return { ok: false, reason: 'platform_not_configured' };

    const { data: gym } = await db.from('gyms').select('id').eq('slug', gymSlug).maybeSingle();
    if (!gym) return { ok: false, reason: 'gym_not_in_registry' };

    const row = directoryRow({ membershipNumber, phone, gymId: gym.id });
    if (!row) return { ok: false, reason: 'incomplete_details' };

    // Upsert: re-registering the same number and phone must not fail on the
    // primary key, and a member who rejoins should point at their current gym.
    const { error } = await db.from('member_directory').upsert(row, { onConflict: 'lookup_hash' });
    if (error) return { ok: false, reason: error.message };

    return { ok: true };
  } catch (err) {
    // Deliberately swallowed. See the header: a convenience index must never
    // turn a completed registration into an error on the member's screen.
    console.error('member directory index failed:', err?.message);
    return { ok: false, reason: err?.message || 'failed' };
  }
}
