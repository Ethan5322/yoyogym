// vercel.json, checked before a deploy rather than by one.
//
// This exists because of a real failure on 2026-09-22. A `_cronsNote` key was
// added to explain why the platform cron had been removed. vercel.json is
// validated against a strict schema and rejects unknown root properties, so
// the deployment failed with "should NOT have additional property" — and the
// explanation was the thing that broke it.
//
// JSON cannot hold a comment. The explanation lives in platform/CRON.md now,
// and this test stops the next person putting prose back into the config.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync('vercel.json', 'utf8'));

/** Root keys vercel.json actually accepts. */
const ALLOWED = new Set([
  '$schema', 'buildCommand', 'devCommand', 'installCommand', 'ignoreCommand',
  'outputDirectory', 'framework', 'public', 'regions', 'functions', 'routes',
  'rewrites', 'redirects', 'headers', 'cleanUrls', 'trailingSlash', 'crons',
  'github', 'images', 'git', 'name', 'version', 'builds', 'env', 'build',
  'alias', 'scope', 'outputFileTracingIncludes', 'outputFileTracingExcludes',
]);

test('NO UNKNOWN ROOT KEYS — Vercel rejects them and fails the deploy', () => {
  const unknown = Object.keys(config).filter((k) => !ALLOWED.has(k));

  assert.deepEqual(
    unknown, [],
    `vercel.json has ${unknown.join(', ')}. JSON has no comments — ` +
      'put the explanation in a .md file, not in the config.'
  );
});

test('the cron count stays within a Hobby plan', () => {
  // The gym already uses three. A fourth was added for the platform and
  // removed again: the platform job runs from the panel button or an external
  // scheduler instead (platform/CRON.md).
  assert.ok(config.crons.length <= 3, `${config.crons.length} crons is more than this plan allows`);
  assert.ok(
    !config.crons.some((c) => c.path.includes('platform')),
    'the platform job is not a Vercel cron — see platform/CRON.md'
  );
});

test('function duration stays within the Hobby limit', () => {
  assert.ok(config.functions['api/**/*.js'].maxDuration <= 10);
});

test('the SPA rewrite still lets /api through', () => {
  // If this ever matched /api, every endpoint would return index.html and the
  // whole backend would look like a blank page.
  const rewrite = config.rewrites.find((r) => r.destination === '/index.html');

  assert.ok(rewrite, 'the SPA needs a catch-all rewrite');
  assert.match(rewrite.source, /\?!api/, 'and it must exclude /api');
});

test('the /g/ gym entry paths reach the SPA', () => {
  // The app sends members to /g/<slug>/register. That has to render the SPA,
  // not 404.
  const rewrite = config.rewrites.find((r) => r.destination === '/index.html');
  const pattern = new RegExp(rewrite.source.replace(/^\//, '^\/'));

  assert.ok(pattern.test('/g/bos-gym/register'), '/g/ must reach the SPA');
  assert.ok(!pattern.test('/api/platform/cron'), 'but /api must not');
});

test('THE PANEL IS REACHABLE — /platform/* is rewritten to the handler', () => {
  // Without this the catch-all sends /platform/login to index.html and the
  // whole admin panel renders the gym app instead. It looks like "the old
  // site opens", not like an error.
  const platform = config.rewrites.find((r) => r.source.startsWith('/platform/'));

  assert.ok(platform, '/platform/* must be rewritten to /api/platform/*');
  assert.match(platform.destination, /^\/api\/platform/);
});

test('the platform rewrite comes BEFORE the SPA catch-all', () => {
  // Rewrites are evaluated top to bottom. Behind the catch-all this rule
  // never runs.
  const platformAt = config.rewrites.findIndex((r) => r.source.startsWith('/platform'));
  const catchAllAt = config.rewrites.findIndex((r) => r.destination === '/index.html');

  assert.ok(platformAt > -1 && catchAllAt > -1);
  assert.ok(platformAt < catchAllAt, 'the catch-all would swallow it');
});


test('the website root is the PLATFORM, not one gym', () => {
  // Typing the domain used to land on the gym's own splash — one gym's
  // registration form as the company's front door.
  const root = config.redirects?.find((r) => r.source === '/');

  assert.ok(root, 'the root must go somewhere deliberate');
  assert.match(root.destination, /^\/platform/);
});

test('the root redirect is TEMPORARY, not permanent', () => {
  // A 301 is cached by browsers forever and is painful to undo. Until the
  // front door is settled, this stays a 307.
  const root = config.redirects.find((r) => r.source === '/');
  assert.equal(root.permanent, false);
});

test('the redirect does not swallow the gym entry paths', () => {
  // /g/<slug>/register comes from the app and a scanned QR. If the root
  // redirect caught those, every member entering a gym would land on a staff
  // login page.
  for (const r of config.redirects) {
    assert.notEqual(r.source, '/(.*)', 'a catch-all redirect would break gym entry');
    assert.ok(!r.source.startsWith('/g/'), 'gym entry must not be redirected');
  }
});
