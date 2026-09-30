// Every call to the database has a deadline (CLAUDE.md §46).
//
// The database stops a statement after 8 seconds by itself (statement_timeout
// on the API role). This stops the WAIT: a connection that never answers would
// otherwise hold a serverless function until Vercel kills it, and every one
// held is one fewer for everybody else. Handed to supabase-js as its fetch.
//
// Used by server/ and platform/ alike, so it lives in shared/ (platform/
// imports nothing from server/).

export const DB_TIMEOUT_MS = 15_000;

export function timedFetch(input, init = {}) {
  // A caller that set its own signal (supabase-js .abortSignal()) keeps it.
  if (init.signal || typeof AbortSignal === 'undefined' || typeof AbortSignal.timeout !== 'function') {
    return fetch(input, init);
  }
  return fetch(input, { ...init, signal: AbortSignal.timeout(DB_TIMEOUT_MS) });
}
