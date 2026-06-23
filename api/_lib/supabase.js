// Server-only Supabase client using the SERVICE ROLE key.
// This bypasses Row Level Security and must NEVER be imported into
// frontend code. The frontend only ever talks to /api functions.
//
// All tables live in the "gym" schema (see SUPABASE_SCHEMA), so the
// client is configured to target it by default — queries use plain
// table names, e.g. supabase.from('members').
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const schema = process.env.SUPABASE_SCHEMA || 'gym';

if (!url || !serviceKey) {
  // Fail loud at cold-start rather than silently mis-querying.
  throw new Error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.'
  );
}

let _client = null;

/** Returns a singleton service-role client scoped to the gym schema. */
export function getSupabase() {
  if (!_client) {
    _client = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema },
    });
  }
  return _client;
}
