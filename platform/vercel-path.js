// Putting a platform address back together after Vercel's rewrite.
//
// Outside Next.js, Vercel matches `api/platform/[...path].js` for ONE path
// segment only — "/platform/plans" reached the router, and
// "/platform/applications/<id>" was answered by Vercel itself with
// NOT_FOUND before any code ran (CLAUDE.md §42.1 F-42.1). Every page that
// opens ONE thing — an application, a gym, a document — and the app's whole
// JSON surface were two segments or more.
//
// Vercel's documented answer for splat routes is a rewrite that names the
// function file literally and carries the rest of the path in the query.
// vercel.json sends every multi-segment address to
// /api/platform/[...path]?__pp=<the rest>, and this puts the address the
// router expects back into req.url.
//
// Whether Vercel presents the ORIGINAL url or the rewritten one in req.url is
// not something to bet a working panel on (see handlePlatform), so both work:
// with no __pp, nothing is touched.

/** The query key vercel.json uses. Deliberately unlike anything a form sends. */
export const PLATFORM_PATH_KEY = '__pp';

/**
 * Rewrite req.url from the carried path, keeping every other query parameter.
 * Vercel also adds its own `path` parameter for the [...path] file; the router
 * never reads one, and it is dropped so it cannot leak into a redirect.
 */
export function restorePlatformPath(req) {
  const url = new URL(req.url || '/', 'http://localhost');
  const carried = url.searchParams.get(PLATFORM_PATH_KEY);
  if (carried === null) return req;

  url.searchParams.delete(PLATFORM_PATH_KEY);
  url.searchParams.delete('path');
  const path = carried.replace(/^\/+/, '');
  const query = url.searchParams.toString();
  req.url = `/platform/${path}${query ? `?${query}` : ''}`;
  return req;
}
