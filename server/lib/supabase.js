// Server-only Supabase client using the SERVICE ROLE key.
// This bypasses Row Level Security and must NEVER be imported into
// frontend code. The frontend only ever talks to /api functions.
//
// All tables live in the "gym" schema (see SUPABASE_SCHEMA), so the
// client is configured to target it by default — queries use plain
// table names, e.g. supabase.from('members').
//
// TWO MODES, one function. Handlers call getSupabase() with no arguments and
// do not know or care which mode is active:
//
//   1. SINGLE GYM (unchanged, and the default). One deployment, one gym, one
//      Supabase project from environment variables. Every existing gym
//      deployment keeps working exactly as before.
//
//   2. PLATFORM. One deployment serving many gyms, each with its own Supabase
//      project. A resolver puts the current request's gym in scope (see
//      server/lib/tenancy.js) and this returns THAT gym's client.
//
// This is the single seam where tenancy lives: every one of the ~76 handlers
// reaches the database through this function, so none of them changed.
import { createClient } from '@supabase/supabase-js';
import { currentGym } from './tenancy.js';

let _client = null;

/**
 * Returns the Supabase client for this request.
 *
 * Platform mode wins when a gym is in scope. Otherwise the process falls back
 * to its own environment, which is the single-gym behaviour.
 */
export function getSupabase() {
  // Platform mode: the resolver has already verified this gym is active, its
  // connection healthy, and fetched its credentials.
  const resolved = currentGym();
  if (resolved?.client) return resolved.client;

  // Single-gym mode.
  if (!_client) {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const schema = process.env.SUPABASE_SCHEMA || 'gym';

    // Fail loud rather than silently mis-querying. This check is made here
    // rather than at module load because a platform deployment legitimately
    // has no gym database of its own — it resolves one per request. A
    // single-gym deployment with missing environment variables still fails on
    // its first query, immediately and with the same message.
    if (!url || !serviceKey) {
      throw new Error(
        'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.'
      );
    }

    _client = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema },
    });
  }
  return _client;
}
