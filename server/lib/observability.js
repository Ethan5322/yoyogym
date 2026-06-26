// Lightweight, dependency-free error capture for the serverless API.
// - Always logs a structured error line (visible in Vercel logs).
// - If ERROR_WEBHOOK_URL is set, forwards the error to your monitoring service
//   (Slack/Discord/Sentry-ingest/your own endpoint), fire-and-forget.
// For full Sentry, add @sentry/node and call Sentry.captureException(err) here —
// this is the single seam to do it.
const WEBHOOK = process.env.ERROR_WEBHOOK_URL;
const ENV = process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';

export function captureError(scope, err, extra = {}) {
  const message = err?.message || String(err);
  const payload = {
    level: 'error',
    scope,
    env: ENV,
    message,
    stack: err?.stack,
    ...extra,
    at: new Date().toISOString(),
  };
  console.error(`[error:${scope}]`, message);
  if (!WEBHOOK) return;
  try {
    fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `🚨 ${ENV} ${scope}: ${message}`, ...payload }),
    }).catch(() => {});
  } catch {
    /* logging must never throw */
  }
}
