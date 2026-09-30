// Vercel entry point for /api/platform/*.
//
// Deliberately tiny, and deliberately importing ONLY from platform/. All
// platform logic lives there, so the boundary in D-081 holds: nothing here
// reaches into server/ or src/, and nothing in the gym app reaches in here.
// This file exists only because Vercel requires an entry point under api/.
import { handlePlatform } from '../../platform/router.js';
import { guardRequest } from '../../server/lib/guard.js';
import { restorePlatformPath } from '../../platform/vercel-path.js';
import { platformDeps, platformOpsDeps, activationDeps, ownerDeps, platformControlDeps } from '../../platform/deps.js';

export default async function handler(req, res) {
  // Size and rate first (CLAUDE.md §46). Its forms read at most 64 KB anyway;
  // documents go straight to Storage, never through here.
  if (!guardRequest(req, res)) return;
  try {
    // Multi-segment addresses arrive rewritten (vercel.json, CLAUDE.md §42.1).
    restorePlatformPath(req);

    // Both sets are merged here rather than in one big factory, so the
    // application flow and the operations flow stay separately readable.
    return await handlePlatform(req, res, {
      ...platformDeps(),
      ...platformOpsDeps(),
      ...activationDeps(),
      ...ownerDeps(),
      ...platformControlDeps(),
    });
  } catch (err) {
    console.error('platform error:', err?.message);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Something went wrong. Please try again.');
    }
  }
}
