// Which gym is this browser in?
//
// A member arrives at /g/bos-gym/register from the app or a scanned QR. From
// that moment every API call this tab makes has to say which gym it is for, or
// the server falls back to single-gym mode and serves the wrong data.
//
// This is the client-side half of server/lib/gymcontext.js, and it is
// deliberately small: capture the slug on arrival, keep it for the tab, send
// it on every request.
//
// ============================================================================
// WHY THIS IS NOT AUTHENTICATION, AND MUST NEVER BE MISTAKEN FOR IT
// ============================================================================
//
// The slug held here is a HINT. The server treats it as one: for an
// authenticated request the gym comes from the signed token, and a hint that
// disagrees with the token is refused outright (403). Nobody reaches another
// gym's data by editing this value — at worst they get an error.
//
// It matters for the requests that have no token yet: registration, the gym's
// public profile, the sign-in form itself. Those are gym-scoped by nature and
// expose nothing private.
//
// ============================================================================
// SESSION STORAGE, NOT LOCAL STORAGE
// ============================================================================
//
// sessionStorage dies with the tab. localStorage would outlive it, so a member
// who visited one gym on a shared phone would leave that gym selected for the
// next person — who would then be typing their details against the wrong gym.
// A tab is the right lifetime for "which gym am I looking at".

const KEY = 'yoyo.gym.slug';

/** A slug is a routing key. Anything else is refused rather than cleaned up. */
const SAFE_SLUG = /^[a-z0-9][a-z0-9-]{0,47}$/;

let cached = null;

/** Read the gym out of a /g/<slug>/… path, or null if this is not one. */
export function slugFromPath(pathname = window.location.pathname) {
  const match = /^\/g\/([^/]+)/.exec(String(pathname || ''));
  if (!match) return null;

  const slug = decodeURIComponent(match[1]).toLowerCase();
  return SAFE_SLUG.test(slug) ? slug : null;
}

/**
 * Capture the gym from the current URL, if there is one.
 *
 * Called once as the app starts. A URL without /g/ leaves whatever was already
 * captured alone — a member who navigates from /g/bos-gym/register to /member
 * is still in the same gym.
 */
export function captureGym(pathname) {
  const slug = slugFromPath(pathname);
  if (!slug) return currentGymSlug();

  cached = slug;
  try {
    window.sessionStorage.setItem(KEY, slug);
  } catch {
    // Private mode, blocked storage. The in-memory value still works for this
    // page load, which is better than refusing to run.
  }
  return slug;
}

/** The gym this tab is in, or null for single-gym mode. */
export function currentGymSlug() {
  if (cached) return cached;

  // The address first. captureGym() runs in App's effect, which React runs
  // AFTER the children's first render — so a protected page reading its
  // session on that first render would otherwise ask before the gym was
  // known, and look in the wrong gym's slot.
  try {
    const fromPath = slugFromPath(window.location.pathname);
    if (fromPath) return captureGym(window.location.pathname);
  } catch {
    // No window (tests, server). Fall through.
  }

  try {
    const stored = window.sessionStorage.getItem(KEY);
    if (stored && SAFE_SLUG.test(stored)) {
      cached = stored;
      return stored;
    }
  } catch {
    // Unreadable storage is the same as no gym: single-gym mode.
  }
  return null;
}

/** Forget the gym — used on sign-out, so the next person starts clean. */
export function clearGym() {
  cached = null;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}

/**
 * The header that names this tab's gym, or nothing in single-gym mode.
 *
 * EVERY request from the gym app must carry it. Three did not — the member
 * portal client, the QR-scan logger and the public profile page — and a
 * request without it is single-gym mode, which reads the DEFAULT schema. Under
 * /g/<slug>/ that is another gym's data: a member of any gym but the first
 * was checked against the first gym's members when signing in.
 *
 * One helper, so "remember to send the gym" is a single import rather than a
 * rule each new fetch has to rediscover.
 */
export function gymHeaders() {
  const gym = currentGymSlug();
  return gym ? { 'X-Gym-Slug': gym } : {};
}
