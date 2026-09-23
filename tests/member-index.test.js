// Filing a new member in the platform's routing index.
//
// Without this row, "I do not remember which gym I joined" searches an empty
// table and tells every member their details do not match.
//
// The tests that matter are the ones about NOT breaking registration. A member
// who has just finished a 38-step signup and had their membership created must
// never see an error because a convenience index could not be written.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.PLATFORM_DIRECTORY_KEY = 'test-only-directory-key';

import { indexMember } from '../server/lib/member-index.js';
import { lookupHash } from '../shared/member-directory.js';

// ---------------------------------------------------------------------------
// It never breaks a registration
// ---------------------------------------------------------------------------

test('SINGLE-GYM MODE WRITES NOTHING AND REPORTS WHY', async () => {
  // The existing deployment has no gym in scope. It must behave exactly as it
  // always has: no row, no error, no change.
  const result = await indexMember({ membershipNumber: 'GYM-2026-1', phone: '0821234567', gymSlug: null });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'no_gym_in_scope');
});

test('an unconfigured platform is reported, not thrown', async () => {
  const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY,
                  purl: process.env.PLATFORM_SUPABASE_URL, pkey: process.env.PLATFORM_SUPABASE_SERVICE_KEY };
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.PLATFORM_SUPABASE_URL;
  delete process.env.PLATFORM_SUPABASE_SERVICE_KEY;

  try {
    // Fresh module: the client is cached after the first successful build.
    const { indexMember: fresh } = await import(`../server/lib/member-index.js?bust=${Math.random()}`);
    const result = await fresh({ membershipNumber: 'GYM-1', phone: '0821234567', gymSlug: 'kom' });

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'platform_not_configured');
  } finally {
    if (saved.url) process.env.SUPABASE_URL = saved.url;
    if (saved.key) process.env.SUPABASE_SERVICE_ROLE_KEY = saved.key;
    if (saved.purl) process.env.PLATFORM_SUPABASE_URL = saved.purl;
    if (saved.pkey) process.env.PLATFORM_SUPABASE_SERVICE_KEY = saved.pkey;
  }
});

test('incomplete details are reported rather than filed under a partial digest', async () => {
  const result = await indexMember({ membershipNumber: '', phone: '', gymSlug: 'kom' });
  assert.equal(result.ok, false);
});

test('it returns a result rather than throwing, whatever happens', async () => {
  // The contract registration relies on: this never raises.
  for (const args of [
    {},
    { membershipNumber: null, phone: null, gymSlug: null },
    { membershipNumber: 'x', phone: 'y', gymSlug: 'nope' },
  ]) {
    await assert.doesNotReject(() => indexMember(args));
  }
});

// ---------------------------------------------------------------------------
// One definition, two readers
// ---------------------------------------------------------------------------

test('THE GYM AND THE PLATFORM COMPUTE THE SAME DIGEST', async () => {
  // If these ever diverged, registration would file a member under one value
  // and the lookup would ask for another — and nobody would ever be found,
  // silently. Both import it from shared/, which is what makes that impossible.
  const platform = await import('../platform/member-directory.js');
  const shared = await import('../shared/member-directory.js');

  const args = { membershipNumber: 'GYM-2026-000123', phone: '+27 82 123 4567' };
  assert.equal(platform.lookupHash(args), shared.lookupHash(args));
  assert.equal(platform.lookupHash(args), lookupHash(args));
});

test('neither side imports the other — shared is the only common ground', async () => {
  const { readFileSync } = await import('node:fs');

  const gymSide = readFileSync('server/lib/member-index.js', 'utf8');
  assert.ok(!/from '.*platform\//.test(gymSide), 'server/ must not import platform/ (D-081)');
  assert.match(gymSide, /shared\/member-directory/, 'it uses the shared definition');

  const platformSide = readFileSync('platform/member-directory.js', 'utf8');
  assert.ok(!/from '.*server\//.test(platformSide), 'platform/ must not import server/');
});
