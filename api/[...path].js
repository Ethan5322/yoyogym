// Root API router. Resolves the route from req.url (robust across Vercel +
// local dev) so existing public URLs stay identical. Logic lives in
// api/_handlers/** (underscore = not counted toward the function limit).
import { json } from './_lib/http.js';
import health from './_handlers/public/health.js';
import catalog from './_handlers/public/catalog.js';
import content from './_handlers/public/content.js';
import register from './_handlers/public/register.js';
import scan from './_handlers/public/scan.js';
import document from './_handlers/public/document.js';

const routes = { health, catalog, content, register, scan, 'members/document': document };

export default function handler(req, res) {
  const parts = new URL(req.url, 'http://localhost').pathname.split('/').filter(Boolean);
  const key = parts.slice(1).join('/'); // drop leading "api"
  const fn = routes[key];
  if (!fn) return json(res, 404, { error: `Not found: /api/${key}` });
  return fn(req, res);
}
