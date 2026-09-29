// The platform's nightly job — billing, the drift report, document retention —
// run from the gym's existing 06:00 schedule (CLAUDE.md §45).
//
// It was never scheduled at all: vercel.json holds the gym's three cron entries
// (the Hobby plan allows few), and platform/CRON.md asked for an outside
// scheduler that nobody set up. The Settings page said "Nightly job: set" —
// true of its secret, and nothing else. Billing switched on would have charged
// nobody, ever.
//
// Called over HTTP, with the job's own secret, rather than imported: the gym
// system and the platform do not import each other (D-081), and this way the
// platform's job runs exactly as it would for any scheduler.
export async function runPlatformNightly(env = process.env, fetchImpl = globalThis.fetch) {
  const secret = env.PLATFORM_CRON_SECRET;
  const host = env.VERCEL_PROJECT_PRODUCTION_URL;
  if (!secret) return { skipped: 'PLATFORM_CRON_SECRET is not set' };
  if (!host) return { skipped: 'no production address' };
  // Production only. Vercel runs crons only there, and the preview shares the
  // same database — a preview must never bill anyone.
  if (env.VERCEL_ENV && env.VERCEL_ENV !== 'production') return { skipped: 'not production' };

  try {
    const res = await fetchImpl(`https://${String(host).replace(/^https?:\/\//, '')}/api/platform/cron`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` },
    });
    return { status: res.status, ok: res.ok };
  } catch (err) {
    return { ok: false, error: err?.message || 'unreachable' };
  }
}
