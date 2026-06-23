// Root API router (Hobby-plan function consolidation). Routes public endpoints
// by URL path so existing URLs stay identical. Real logic lives in
// api/_handlers/** (underscore = not deployed as separate functions).
import { json } from './_lib/http.js';
import health from './_handlers/public/health.js';
import catalog from './_handlers/public/catalog.js';
import content from './_handlers/public/content.js';
import register from './_handlers/public/register.js';
import scan from './_handlers/public/scan.js';
import document from './_handlers/public/document.js';

const routes = {
  health,
  catalog,
  content,
  register,
  scan,
  'members/document': document,
};

export default function handler(req, res) {
  const key = (req.query?.path || []).join('/');
  const fn = routes[key];
  if (!fn) return json(res, 404, { error: `Not found: /api/${key}` });
  return fn(req, res);
}
