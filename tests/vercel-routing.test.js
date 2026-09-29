// Every platform address must reach the router ON VERCEL, not only in tests.
//
// Found live, 2026-09-29 (CLAUDE.md §42.1 F-42.1): outside Next.js Vercel
// matches api/platform/[...path].js for ONE path segment only. Every address
// with two or more — an application's page, opening a document, uploading
// one, a gym's page, the app's gym search — was answered by Vercel itself with
// NOT_FOUND. The router handled them perfectly; they never reached it. These
// tests pin the rewrite that carries them there and the step that puts the
// address back together.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.PLATFORM_JWT_SECRET ||= 'test-only-platform-secret-distinct';
process.env.JWT_SECRET ||= 'test-only-gym-secret';

import { restorePlatformPath, PLATFORM_PATH_KEY } from '../platform/vercel-path.js';
import { handlePlatform } from '../platform/router.js';

const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

test('multi-segment platform addresses are rewritten to the function file by name', () => {
  const sources = vercel.rewrites.map((r) => r.source);
  const multi = vercel.rewrites.find((r) => r.source === '/platform/:first/:rest+');
  assert.ok(multi, 'a rule for two or more segments exists');
  assert.equal(multi.destination, `/api/platform/[...path]?${PLATFORM_PATH_KEY}=:first/:rest+`);

  // BEFORE the one-segment rule, or that rule would take them to the same dead end.
  assert.ok(sources.indexOf('/platform/:first/:rest+') < sources.indexOf('/platform/:path*'));

  const direct = vercel.rewrites.find((r) => r.source === '/api/platform/:first/:rest+');
  assert.ok(direct, 'the /api/platform/ form too');
  assert.ok(sources.indexOf('/api/platform/:first/:rest+') < sources.indexOf('/platform/:path*'));
});

test('the one-segment rule that already worked is left exactly as it was', () => {
  const one = vercel.rewrites.find((r) => r.source === '/platform/:path*');
  assert.equal(one.destination, '/api/platform/:path*');
});

test('the carried path becomes the address the router expects, keeping the query', () => {
  const req = { url: `/api/platform/[...path]?${PLATFORM_PATH_KEY}=applications/abc-123&tab=waiting&path=applications` };
  restorePlatformPath(req);
  assert.equal(req.url, '/platform/applications/abc-123?tab=waiting');
});

test('an encoded slash in the carried path is understood', () => {
  const req = { url: `/api/platform/%5B...path%5D?${PLATFORM_PATH_KEY}=my-gym%2Fdocuments%2Frequest` };
  restorePlatformPath(req);
  assert.equal(req.url, '/platform/my-gym/documents/request');
});

test('a request that was not rewritten is left alone', () => {
  for (const url of ['/platform/plans', '/api/platform/login?as=owner', '/platform/applications/abc']) {
    const req = { url };
    restorePlatformPath(req);
    assert.equal(req.url, url);
  }
});

test('a rewritten request reaches the right route: the app\'s gym search', async () => {
  const req = {
    method: 'GET',
    url: `/api/platform/[...path]?${PLATFORM_PATH_KEY}=api/gyms&q=kom`,
    headers: {},
  };
  restorePlatformPath(req);

  let status = 0;
  let sent = '';
  const res = {
    headersSent: false,
    setHeader() {},
    writeHead(code) { status = code; this.headersSent = true; },
    end(b) { sent = String(b ?? ''); },
  };
  const asked = [];
  await handlePlatform(req, res, {
    searchGyms: async (q) => { asked.push(q); return [{ slug: 'kom', name: 'KOM' }]; },
    audit: async () => {},
  });

  assert.equal(status, 200);
  assert.equal(asked[0].query, 'kom');
  assert.equal(JSON.parse(sent).gyms[0].slug, 'kom');
});
