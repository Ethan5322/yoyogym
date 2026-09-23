// The diagnostic that tells an anon key from a service key.
//
// Written after an afternoon lost to this: the owner row was correct in the
// database and the app still could not see it. The SQL Editor talks to
// Postgres directly, the app talks through PostgREST with a key, and every
// difference between those paths is invisible from either end.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { platformHealth, keyRole } from '../platform/health.js';

/** A Supabase key is a JWT whose payload carries a `role`. */
const fakeKey = (role) =>
  ['x', Buffer.from(JSON.stringify({ role })).toString('base64url'), 'y'].join('.');

const env = (over = {}) => ({
  SUPABASE_URL: 'https://abc.supabase.co',
  PLATFORM_SUPABASE_SERVICE_KEY: fakeKey('service_role'),
  PLATFORM_JWT_SECRET: 'a-platform-secret',
  JWT_SECRET: 'a-different-gym-secret',
  PLATFORM_SETUP_TOKEN: 'tok',
  ...over,
});

const find = (report, name) => report.checks.find((c) => c.name === name);

// ---------------------------------------------------------------------------
// Reading the key
// ---------------------------------------------------------------------------

test('the role inside a key is readable without verifying it', () => {
  assert.equal(keyRole(fakeKey('service_role')), 'service_role');
  assert.equal(keyRole(fakeKey('anon')), 'anon');
  assert.equal(keyRole(''), 'missing');
  assert.equal(keyRole('not-a-jwt'), 'not-a-jwt');
});

test('NO KEY, OR PART OF ONE, IS EVER RETURNED', async () => {
  const secret = fakeKey('service_role');
  const report = await platformHealth({ env: env(), countUsers: async () => 1 });

  const text = JSON.stringify(report);
  assert.ok(!text.includes(secret), 'the key must never appear');
  assert.ok(!text.includes('a-platform-secret'), 'nor any other secret');
});

// ---------------------------------------------------------------------------
// The trap: zero rows and no error
// ---------------------------------------------------------------------------

test('THE ANON KEY IS NAMED AS THE LIKELY CAUSE', async () => {
  // RLS is on with no policies, so the anon role is denied everything and
  // every query returns zero rows AND NO ERROR — indistinguishable from an
  // empty database unless something says so.
  const report = await platformHealth({
    env: env({ PLATFORM_SUPABASE_SERVICE_KEY: fakeKey('anon') }),
    countUsers: async () => 0,
  });

  const key = find(report, 'Supabase key role');
  assert.equal(key.ok, false);
  assert.equal(key.detail, 'anon');
  assert.match(key.fix, /ANON key/);
  assert.match(key.fix, /NO ERROR/i, 'and explains why nothing looked wrong');
});

test('zero rows with a correct key is still reported as a problem', async () => {
  const report = await platformHealth({ env: env(), countUsers: async () => 0 });

  const read = find(report, 'Read platform.platform_users');
  assert.equal(read.ok, false);
  assert.match(read.detail, /0 rows.*no error/i);
});

// ---------------------------------------------------------------------------
// The other cause: the schema is not exposed
// ---------------------------------------------------------------------------

test('a schema error points at the exposed-schemas setting', async () => {
  const report = await platformHealth({
    env: env(),
    countUsers: async () => { throw new Error('The schema must be one of the following: public'); },
  });

  const read = find(report, 'Read platform.platform_users');
  assert.equal(read.ok, false);
  assert.match(read.fix, /Exposed schemas/i);
  assert.match(read.fix, /ADD it to the list/i, 'and warns against replacing it');
});

// ---------------------------------------------------------------------------
// The secrets
// ---------------------------------------------------------------------------

test('a platform secret identical to the gym one is flagged', async () => {
  const report = await platformHealth({
    env: env({ PLATFORM_JWT_SECRET: 'same', JWT_SECRET: 'same' }),
    countUsers: async () => 1,
  });

  assert.ok(report.checks.some((c) => c.name === 'Platform secret is distinct' && !c.ok));
});

test('a healthy deployment reports ok', async () => {
  const report = await platformHealth({ env: env(), countUsers: async () => 1 });

  assert.equal(report.ok, true);
  assert.ok(report.checks.every((c) => c.ok));
});
