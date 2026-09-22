// "Sign in as member" — the routing index.
//
// The member types their membership number and phone and does NOT say which
// gym. Membership numbers are unique per gym, not globally, so two gyms can
// each have GYM-2026-000123 and they are different people. And there are meant
// to be ten thousand gyms, so querying each one per attempt is not an option.
//
// This index answers "which gym" in one lookup, and the tests are mostly about
// what it must NOT reveal.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.PLATFORM_DIRECTORY_KEY = 'test-only-directory-key';

import {
  lookupHash,
  directoryRow,
  routeMember,
  normalisePhone,
  normaliseMembershipNumber,
} from '../platform/member-directory.js';

// ---------------------------------------------------------------------------
// What is stored
// ---------------------------------------------------------------------------

test('the stored row holds NO personal data at all', () => {
  const row = directoryRow({ membershipNumber: 'GYM-2026-000123', phone: '+27 82 123 4567', gymId: 'g1' });
  const text = JSON.stringify(row);

  assert.ok(!text.includes('GYM-2026-000123'), 'not the membership number');
  assert.ok(!text.includes('821234567'), 'not the phone');
  assert.deepEqual(Object.keys(row).sort(), ['gym_id', 'lookup_hash']);
});

test('the digest is KEYED, so the table is useless on its own', () => {
  // A membership number is ~1e6 possibilities and a phone number is knowable.
  // With a plain hash, anyone holding this table and a person's phone could
  // brute-force which gym that person attends in seconds.
  const a = lookupHash({ membershipNumber: 'GYM-2026-000123', phone: '0821234567' });

  process.env.PLATFORM_DIRECTORY_KEY = 'a-different-key';
  const b = lookupHash({ membershipNumber: 'GYM-2026-000123', phone: '0821234567' });
  process.env.PLATFORM_DIRECTORY_KEY = 'test-only-directory-key';

  assert.notEqual(a, b, 'the same inputs under a different key give a different digest');
});

// ---------------------------------------------------------------------------
// The same person, typed differently
// ---------------------------------------------------------------------------

test('the same phone typed three ways finds the same member', () => {
  // +27 82 123 4567, 0821234567 and 27821234567 are one phone. Treating them
  // as three people sends a member back to the sign-in screen over a space.
  const forms = ['+27 82 123 4567', '0821234567', '27821234567', '082 123 4567'];
  const hashes = forms.map((phone) => lookupHash({ membershipNumber: 'GYM-2026-000123', phone }));

  assert.equal(new Set(hashes).size, 1, `these should all be one member: ${forms.join(', ')}`);
});

test('a membership number is case-insensitive and tolerates stray spaces', () => {
  const a = lookupHash({ membershipNumber: 'gym-2026-000123', phone: '0821234567' });
  const b = lookupHash({ membershipNumber: ' GYM-2026-000123 ', phone: '0821234567' });

  assert.equal(a, b);
});

test('normalising is exposed, so registration and sign-in cannot drift apart', () => {
  // The two forms of one phone must normalise to the SAME value — that is
  // the whole reason this function exists.
  assert.equal(normalisePhone('+27 (82) 123-4567'), '821234567');
  assert.equal(normalisePhone('0821234567'), '821234567');
  assert.equal(normalisePhone('+27 (82) 123-4567'), normalisePhone('0821234567'));
  assert.equal(normaliseMembershipNumber(' gym-2026-1 '), 'GYM-2026-1');
});

test('two different members never collide across the separator', () => {
  // ("AB","1") and ("A","B1") must not produce the same digest.
  const a = lookupHash({ membershipNumber: 'AB', phone: '1' });
  const b = lookupHash({ membershipNumber: 'A', phone: 'B1' });

  assert.notEqual(a, b);
});

test('missing details produce no digest rather than a guessable one', () => {
  assert.equal(lookupHash({ membershipNumber: '', phone: '0821234567' }), null);
  assert.equal(lookupHash({ membershipNumber: 'GYM-1', phone: '' }), null);
  assert.equal(directoryRow({ membershipNumber: '', phone: '', gymId: 'g1' }), null);
});

// ---------------------------------------------------------------------------
// Routing the sign-in
// ---------------------------------------------------------------------------

test('one match signs the member in at that gym', () => {
  const result = routeMember([{ gym_id: 'g1', slug: 'bos-gym' }]);

  assert.equal(result.ok, true);
  assert.equal(result.gym.slug, 'bos-gym');
});

test('NO MATCH GIVES ONE GENERIC MESSAGE', () => {
  // "No such membership number" and "wrong phone" would together let anyone
  // test whether a given person belongs to any gym on the platform.
  const result = routeMember([]);

  assert.equal(result.ok, false);
  assert.match(result.reason, /could not find a membership/i);
  assert.ok(!/gym|phone|number/i.test(result.reason.replace(/membership/i, '')), 'nothing specific');
});

test('a member of two gyms is ASKED, never guessed at', () => {
  // Allowed, and the only case where the member answers a question. Picking
  // one would sign somebody into the wrong gym.
  const result = routeMember([
    { gym_id: 'g1', slug: 'bos-gym' },
    { gym_id: 'g2', slug: 'iron-works' },
  ]);

  assert.equal(result.ok, true);
  assert.equal(result.choose.length, 2);
  assert.ok(!result.gym, 'no gym is chosen for them');
});

test('rubbish from the database is treated as no match, not as a crash', () => {
  assert.equal(routeMember(null).ok, false);
  assert.equal(routeMember(undefined).ok, false);
});
