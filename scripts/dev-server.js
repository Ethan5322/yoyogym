// Minimal local API server so the /api serverless functions run during
// development without the Vercel CLI. Vite (port 5173) proxies /api here.
// Maps /api/<path> -> api/<path>.js and invokes its default export, adding the
// Vercel-style res.status() helper the handlers expect.
import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const PORT = process.env.DEV_API_PORT || 3000;

const server = http.createServer(async (req, res) => {
  // Vercel-style helper used throughout the handlers.
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };

  if (!req.url.startsWith('/api/')) {
    res.status(404).end('Local API server — open the app via Vite on http://localhost:5173');
    return;
  }

  const clean = req.url.split('?')[0].replace(/^\/api\//, '');
  const file = path.resolve('api', `${clean}.js`);

  if (!existsSync(file)) {
    res.status(404).setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: `No API route: ${clean}` }));
    return;
  }

  try {
    const mod = await import(`${pathToFileURL(file).href}?t=${Date.now()}`); // bust cache for edits
    await mod.default(req, res);
  } catch (err) {
    console.error('API handler error:', clean, err);
    if (!res.headersSent) {
      res.status(500).setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: err.message }));
    }
  }
});

server.listen(PORT, () => console.log(`Local API server running on http://localhost:${PORT}`));
