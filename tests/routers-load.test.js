// Every API router, and every handler behind it, must LOAD.
//
// 2026-09-28: `server/lib/sessions.js` was replaced by a new file of the same
// name, and `consumeSession` — imported by two handlers — disappeared. A router
// loads all its handlers at once, so the whole admin API and the whole member
// API failed in production with FUNCTION_INVOCATION_FAILED, while 957 tests
// passed: no test had ever imported a router. This one does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Read when the modules run, after every import has been linked — which is the
// part this test is about.
process.env.JWT_SECRET ||= 'test-only-load-check';

const ROUTERS = [
  'api/[...path].js',
  'api/admin/[...path].js',
  'api/auth/[...path].js',
  'api/member/[...path].js',
  'api/cron/[...path].js',
  'api/platform/[...path].js',
];

for (const router of ROUTERS) {
  test(`the ${router} router loads, with every handler it imports`, async () => {
    const mod = await import(pathToFileURL(router).href);
    assert.equal(typeof mod.default, 'function');
  });
}

function* jsFiles(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* jsFiles(path);
    else if (name.endsWith('.js')) yield path;
  }
}

test('every handler module loads — including any no router reaches yet', async () => {
  const broken = [];
  for (const file of jsFiles('server/handlers')) {
    try {
      await import(pathToFileURL(file).href);
    } catch (err) {
      broken.push(`${file}: ${err.message}`);
    }
  }
  assert.deepEqual(broken, []);
});

test('every server library module loads', async () => {
  const broken = [];
  for (const file of jsFiles('server/lib')) {
    try {
      await import(pathToFileURL(file).href);
    } catch (err) {
      broken.push(`${file}: ${err.message}`);
    }
  }
  assert.deepEqual(broken, []);
});
