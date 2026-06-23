// Authorization guard for cron endpoints. Vercel Cron sends requests with an
// `x-vercel-cron` header; we also accept an explicit `Authorization: Bearer
// <CRON_SECRET>` so the jobs can be triggered/tested manually & securely.
import { unauthorized } from './http.js';

export function authorizeCron(req, res) {
  const secret = process.env.CRON_SECRET;

  if (req.headers['x-vercel-cron']) return true; // genuine Vercel cron invocation
  if (secret && req.headers['authorization'] === `Bearer ${secret}`) return true;
  if (!secret) return true; // not configured (local/dev) -> allow

  unauthorized(res, 'Cron unauthorized');
  return false;
}
