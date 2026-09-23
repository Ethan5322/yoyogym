/* GENERATED from shared/qr-payload.js by scripts/mobile/configure-shell.mjs.
   Do not edit: `npm run mobile:configure` overwrites this file.
   The rules live in shared/qr-payload.js and are tested there. */
(function () {
// What a scanned QR code means.
//
// In shared/ because the app reads these and the gym generates them, and
// D-081 forbids server/ and platform/ importing each other. One definition of
// what a Yoyo QR is, and one place to change it.
//
// ============================================================================
// THE PAYLOAD IS A URL, AND THAT IS DELIBERATE
// ============================================================================
//
// A gym's QR carries `https://<host>/g/<slug>`. Not a bare slug, not JSON, not
// a custom scheme. A URL because CLAUDE.md §14 requires one code to do four
// things: open the app if it is installed, open a web page if it is not, reach
// the right app store, and land in the right gym afterwards.
//
// Only a real https URL can do that. A custom scheme like yoyo://kom shows an
// error page to everyone without the app, which is most people holding a phone
// up to a poster for the first time. App Links and Universal Links are then
// what let the app claim these URLs later without reprinting a single code.
//
// ============================================================================
// WHAT A YOYO QR MUST NEVER CARRY
// ============================================================================
//
// Passwords, biometric data, health information, reusable authentication
// secrets, personal data (§14). A QR on a wall is photographed by strangers
// and lives in camera rolls; anything inside it is public.
//
// A gym slug is public and that is fine (D-035). A verification code is NOT:
// `POST /api/document` accepts membership number plus verification code with
// no session, so a QR carrying that pair would be a document-access token
// anybody could photograph. `refuse` below exists for exactly that.

/** A slug is a routing key: a plain identifier and nothing else. */
const SAFE_SLUG = /^[a-z0-9][a-z0-9-]{0,47}$/;

/**
 * The first path segment of every gym-less code this system used to print.
 *
 * Kept as a closed set rather than "anything on our host", so a link to the
 * platform panel or a marketing page is still an unknown code rather than a
 * confusing half-answer.
 */
const LEGACY_PATHS = new Set(['', 'register', 'member', 'p', 'admin']);

/** Was this scanned from a host the app already trusts? */
function knownHost(url, hosts) {
  return (hosts || []).some((host) =>
    host.indexOf('*.') === 0 ? url.hostname.endsWith(host.slice(1)) : url.hostname === host
  );
}

/** Parameters that must never appear in a scanned payload. */
const FORBIDDEN_PARAMS = ['code', 'verification_code', 'token', 'password', 'secret', 'key', 'pin'];

/**
 * Read a scanned QR payload.
 *
 * @param {string} raw            what the camera read
 * @param {string[]} [knownHosts]   hosts this app already talks to, so a code
 *                                  printed before gym slugs existed can be
 *                                  recognised as ours rather than dismissed
 * @returns {{kind: 'gym', slug: string}
 *          |{kind: 'member', slug: string, membershipNumber: string}
 *          |{kind: 'gymless', reason: string}
 *          |{kind: 'unknown', reason: string}}
 */
function readQrPayload(raw, knownHosts = []) {
  const text = String(raw ?? '').trim();
  if (!text) return { kind: 'unknown', reason: 'Nothing was scanned.' };

  // A bare slug, for a code generated before the URL format or typed by hand.
  if (SAFE_SLUG.test(text)) return { kind: 'gym', slug: text };

  let url;
  try {
    url = new URL(text);
  } catch {
    return { kind: 'unknown', reason: 'That is not a Yoyo Gyms code.' };
  }

  // REFUSED BEFORE ANYTHING IS READ FROM IT. A payload carrying a secret is
  // not a payload to interpret carefully — it is one to reject, because
  // accepting it teaches whoever made it that it works.
  for (const param of FORBIDDEN_PARAMS) {
    if (url.searchParams.has(param)) {
      return {
        kind: 'unknown',
        reason: 'That code carries information it should not. Ask your gym for a new one.',
      };
    }
  }

  const parts = url.pathname.split('/').filter(Boolean);

  // /g/<slug>            → a gym
  // /g/<slug>/member     → a gym, member side
  // /g/<slug>/p/member/<membership number> → a member's own card
  if (parts[0] === 'g' && SAFE_SLUG.test(parts[1] || '')) {
    const slug = parts[1];

    if (parts[2] === 'p' && parts[4]) {
      // A member-ID code. It names a member; IT DOES NOT SIGN THEM IN (§14).
      // The app opens that gym's sign-in with the number filled in, and the
      // member still proves who they are.
      return { kind: 'member', slug, membershipNumber: decodeURIComponent(parts[4]) };
    }

    return { kind: 'gym', slug };
  }

  // A YOYO CODE THAT PREDATES GYM SLUGS.
  //
  // Every code this system printed before today was gym-less: /register,
  // /member, /p/m/<number>, /admin/login. Those are on real paper, on real
  // walls, and the vault is explicit that a new scheme must be additive rather
  // than orphan them (09 - QR-Code Architecture).
  //
  // The app cannot tell which gym one belongs to — nothing in it says — so it
  // cannot route. What it CAN do is stop calling the gym's own poster a fake,
  // and say the one useful thing instead.
  if (knownHost(url, knownHosts) && LEGACY_PATHS.has(parts[0] || '')) {
    return {
      kind: 'gymless',
      reason: 'That code was made before this app and does not say which gym it belongs to. Search for your gym by name instead.',
    };
  }

  return { kind: 'unknown', reason: 'That is not a Yoyo Gyms code.' };
}

/**
 * The URL a gym's QR code should contain.
 *
 * One function, so a code generated today and a code generated in a year point
 * at the same shape of thing.
 */
function gymQrUrl(baseUrl, slug) {
  if (!SAFE_SLUG.test(String(slug || ''))) throw new Error(`Unsafe gym slug: ${slug}`);
  return `${String(baseUrl).replace(/\/+$/, '')}/g/${slug}`;
}

/** Where a scanned payload should send somebody. */
function pathForPayload(payload) {
  if (payload.kind === 'gym') return `/g/${encodeURIComponent(payload.slug)}`;

  if (payload.kind === 'member') {
    // The member portal, with the number filled in — never signed in.
    return `/g/${encodeURIComponent(payload.slug)}/member?member=${encodeURIComponent(payload.membershipNumber)}`;
  }

  return null;
}

  window.YOYO_QR = Object.freeze({ readQrPayload, gymQrUrl, pathForPayload });
})();
