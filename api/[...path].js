// Root API router. Resolves the route from req.url. Logic lives in /server
// (outside /api), so only the 6 router files count as Serverless Functions.
import { json } from '../server/lib/http.js';
import health from '../server/handlers/public/health.js';
import catalog from '../server/handlers/public/catalog.js';
import content from '../server/handlers/public/content.js';
import register from '../server/handlers/public/register.js';
import scan from '../server/handlers/public/scan.js';
import document from '../server/handlers/public/document.js';
import publicProfile from '../server/handlers/public/public-profile.js';

const routes = { health, catalog, content, register, scan, 'members/document': document, 'public-profile': publicProfile };

export default function handler(req, res) {
  const parts = new URL(req.url, 'http://localhost').pathname.split('/').filter(Boolean);
  const key = parts.slice(1).join('/'); // drop leading "api"
  const fn = routes[key];
  if (!fn) return json(res, 404, { error: `Not found: /api/${key}` });
  return fn(req, res);
}
