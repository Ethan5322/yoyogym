// Is this gym open, and if not, what does the member need to be told?
//
// ============================================================================
// The dead end this removes
// ============================================================================
//
// Gym resolution already answers precisely: 404 the gym does not exist, 402 it
// is provisioned but its owner has not paid, 403 it is suspended, 503 it is
// temporarily unreachable. Four different situations with four different
// answers.
//
// The client threw all of them away. loadBranding() ends in `.catch(() => ({}))`,
// so a member who scanned a suspended gym's QR got the ordinary screens with
// default colours, filled in a 38-step registration form, and found out at the
// END that the gym was not there.
//
// So the status is kept, and the screens that depend on a gym check it first.
//
// ============================================================================
// Only for a gym-scoped visit
// ============================================================================
//
// In single-gym mode there is no slug, nothing to resolve, and a failed
// content fetch is an ordinary network blip. Blocking the app on one would
// break the existing deployment to fix a problem it does not have.

/** Statuses that mean "resolution answered, and the answer was no". */
const RESOLUTION = new Set([402, 403, 404, 503]);

/**
 * Turn a failed gym-scoped request into something to show a person.
 *
 * Returns null when this is not a gym problem — a 500, a dropped connection,
 * single-gym mode — because those are not the member's to understand and a
 * wrong explanation is worse than a spinner.
 *
 * @param {number|null} status  the HTTP status the API answered with
 * @param {string|null} slug    the gym in the URL, or null in single-gym mode
 */
export function gymGate(status, slug) {
  if (!slug || !RESOLUTION.has(status)) return null;

  switch (status) {
    case 404:
      return {
        status,
        title: 'We could not find that gym',
        // Said without blame in either direction. An old QR code and a
        // mistyped link look identical from here.
        detail: 'The code or link you used does not match a gym on Yoyo Gyms. It may be out of date.',
        action: 'Search for your gym by name',
      };

    case 402:
      // The owner has not paid. The MEMBER must not be told that — it is the
      // gym's business, not theirs, and "your gym has not paid" is a sentence
      // that damages a gym in front of its own customers.
      return {
        status,
        title: 'This gym is not open yet',
        detail: 'It is still being set up. Ask at reception, or try again later.',
        action: 'Search for another gym',
      };

    case 403:
      return {
        status,
        title: 'This gym is not currently open on Yoyo Gyms',
        detail: 'Your membership and your records are safe. Please ask your gym directly.',
        action: 'Search for another gym',
      };

    default:
      return {
        status,
        title: 'This gym is temporarily unavailable',
        // A 503 is the one worth retrying, and it is the only one where
        // "try again" is honest advice rather than a shrug.
        detail: 'Something on our side is not responding. Please try again in a few minutes.',
        action: 'Try again',
        retryable: true,
      };
  }
}
