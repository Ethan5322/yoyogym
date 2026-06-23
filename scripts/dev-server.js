// Local API server matching Vercel's catch-all routing. Routes /api/<domain>/*
// to api/<domain>/[...path].js (or the root api/[...path].js), populating
// req.query.path so the routers work exactly as on Vercel.
import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const PORT = process.env.DEV_API_PORT || 3000;
const ROUTER_FOLDERS = ['auth', 'member', 'payments', 'admin', 'cron'];

const server = http.createServer(async (req, res) => {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };

  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/api/')) {
    res.status(404).end('Local API server — open the app via Vite on http://localhost:5173');
    return;
  }

  const segs = url.pathname.replace(/^\/api\//, '').split('/').filter(Boolean);
  let routerFile;
  let pathParam;
  if (ROUTER_FOLDERS.includes(segs[0])) {
    routerFile = path.resolve('api', segs[0], '[...path].js');
    pathParam = segs.slice(1);
  } else {
    routerFile = path.resolve('api', '[...path].js');
    pathParam = segs;
  }

  if (!existsSync(routerFile)) {
    res.status(404).setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: `No router for /api/${segs.join('/')}` }));
    return;
  }

  // Emulate Vercel's req.query (string params + catch-all path array).
  req.query = Object.fromEntries(url.searchParams.entries());
  req.query.path = pathParam;

  try {
    const mod = await import(`${pathToFileURL(routerFile).href}?t=${Date.now()}`);
    await mod.default(req, res);
  } catch (err) {
    console.error('API error:', segs.join('/'), err);
    if (!res.headersSent) {
      res.status(500).setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: err.message }));
    }
  }
});

server.listen(PORT, () => console.log(`Local API server (catch-all) on http://localhost:${PORT}`));
