// "Use my location" must return the nearest gyms, not 25 gyms sorted.
//
// The search asked the database for any 25 active gyms and sorted THOSE by
// distance. At ten thousand gyms the member's nearest gym was almost never in
// the 25, and the list — neatly ordered — looked right.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  coordinate, haversineKm, boundingBox, nearestFirst, nearestGyms, likeTerm, RESULT_LIMIT,
} from '../platform/gym-search.js';

const CAPE_TOWN = { lat: -33.9249, lng: 18.4241 };

/** A fake table, and a fetch that honours the box the way the SQL does. */
function table(gyms) {
  const calls = [];
  const fetchRows = async (box, limit) => {
    calls.push(box);
    return gyms
      .filter((g) =>
        box
          ? g.latitude !== null && g.latitude >= box.minLat && g.latitude <= box.maxLat &&
            g.longitude >= box.minLng && g.longitude <= box.maxLng
          : g.latitude !== null && g.longitude !== null
      )
      .slice(0, limit);
  };
  return { fetchRows, calls };
}

// Deterministic pseudo-random, so a failure reproduces.
function rng(seed) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
}

test('AMONG TEN THOUSAND GYMS, THE NEAREST ONE IS FOUND', async () => {
  const rand = rng(42);
  const gyms = Array.from({ length: 10_000 }, (_, i) => ({
    slug: `gym-${i}`,
    latitude: rand() * 140 - 70,
    longitude: rand() * 360 - 180,
  }));
  // One gym, down the road, placed LAST — the old code's first 25 would
  // never have reached it.
  gyms.push({ slug: 'down-the-road', latitude: CAPE_TOWN.lat + 0.01, longitude: CAPE_TOWN.lng });

  const { fetchRows } = table(gyms);
  const found = await nearestGyms(fetchRows, CAPE_TOWN.lat, CAPE_TOWN.lng);

  assert.equal(found[0].slug, 'down-the-road');

  // And the result really is the true nearest, not just nearest-of-a-sample.
  const truth = nearestFirst(gyms, CAPE_TOWN.lat, CAPE_TOWN.lng);
  assert.deepEqual(found.map((g) => g.slug), truth.slice(0, found.length).map((g) => g.slug));
});

test('the search widens until it finds something (D-073)', async () => {
  // The only gym is ~1000 km away. An empty screen would look broken.
  const { fetchRows, calls } = table([{ slug: 'far', latitude: -25.7479, longitude: 28.2293 }]);
  const found = await nearestGyms(fetchRows, CAPE_TOWN.lat, CAPE_TOWN.lng);

  assert.equal(found[0].slug, 'far');
  assert.ok(calls.length > 1, 'it had to widen');
  assert.ok(found[0].distance_km > 900);
});

test('it stops at the first radius that answers', async () => {
  const { fetchRows, calls } = table([{ slug: 'near', latitude: CAPE_TOWN.lat, longitude: CAPE_TOWN.lng }]);
  await nearestGyms(fetchRows, CAPE_TOWN.lat, CAPE_TOWN.lng);
  assert.equal(calls.length, 1);
});

test('a gym in the corner of a box does not hide a nearer one in the next box', () => {
  // The 25 km box's corner is ~35 km out. A gym there must wait for the
  // 100 km pass, where it is sorted against everything at that range.
  const box = boundingBox(CAPE_TOWN.lat, CAPE_TOWN.lng, 25);
  const corner = { slug: 'corner', latitude: box.maxLat - 0.001, longitude: box.maxLng - 0.001 };
  assert.deepEqual(nearestFirst([corner], CAPE_TOWN.lat, CAPE_TOWN.lng, 25), []);
});

test('results are capped for a phone screen', async () => {
  const gyms = Array.from({ length: 100 }, (_, i) => ({
    slug: `g${i}`, latitude: CAPE_TOWN.lat + i * 0.001, longitude: CAPE_TOWN.lng,
  }));
  const found = await nearestGyms(table(gyms).fetchRows, CAPE_TOWN.lat, CAPE_TOWN.lng);
  assert.equal(found.length, RESULT_LIMIT);
  assert.equal(found[0].slug, 'g0');
});

// ---------------------------------------------------------------------------
// Number(null) === 0
// ---------------------------------------------------------------------------

test('A GYM WITH NO LOCATION HAS NO DISTANCE', () => {
  // Number(null) is 0, and 0 is finite — so this gym used to be measured as
  // though it stood at 0°, 0° in the Gulf of Guinea.
  assert.equal(haversineKm(CAPE_TOWN.lat, CAPE_TOWN.lng, null, null), null);
  assert.equal(haversineKm(CAPE_TOWN.lat, CAPE_TOWN.lng, '', ''), null);
  assert.equal(haversineKm(CAPE_TOWN.lat, CAPE_TOWN.lng, undefined, 18), null);
});

test('coordinates arrive from Postgres as strings, and still count', () => {
  // numeric(9,6) comes back from PostgREST as "-33.924900".
  assert.equal(coordinate('-33.924900'), -33.9249);
  assert.ok(haversineKm('-33.9249', '18.4241', -33.9249, 18.4241) === 0);
});

test('0 is a real coordinate, not a missing one', () => {
  assert.equal(coordinate(0), 0);
  assert.equal(coordinate('0'), 0);
});

// ---------------------------------------------------------------------------
// The box
// ---------------------------------------------------------------------------

test('a box near the 180° meridian takes every longitude rather than miss a gym', () => {
  const fiji = boundingBox(-17.7, 178.9, 500);
  assert.equal(fiji.minLng, -180);
  assert.equal(fiji.maxLng, 180);
});

test('a box near a pole spans every longitude', () => {
  const box = boundingBox(89.99, 0, 25);
  assert.equal(box.minLng, -180);
  assert.equal(box.maxLng, 180);
});

test('an ordinary box is centred and not wrapped', () => {
  const box = boundingBox(CAPE_TOWN.lat, CAPE_TOWN.lng, 25);
  assert.ok(box.minLat < CAPE_TOWN.lat && box.maxLat > CAPE_TOWN.lat);
  assert.ok(box.minLng < CAPE_TOWN.lng && box.maxLng > CAPE_TOWN.lng);
  assert.ok(box.maxLng - box.minLng < 1);
});

// ---------------------------------------------------------------------------
// The name search
// ---------------------------------------------------------------------------

test('A MEMBER TYPING "%" IS TYPING TEXT, NOT A WILDCARD', () => {
  // Unescaped, "%" matched every gym on the platform.
  assert.equal(likeTerm('100%'), '%100\\%%');
  assert.equal(likeTerm('a_b'), '%a\\_b%');
  assert.equal(likeTerm('back\\slash'), '%back\\\\slash%');
  assert.equal(likeTerm('BOS GYM'), '%BOS GYM%');
});

// ---------------------------------------------------------------------------
// The app's search screen
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

test('THE APP DOES NOT CALL A FAILED SEARCH "NO GYMS FOUND"', () => {
  // A 500 or 429 rendered as an empty list told members their gym was not on
  // Yoyo Gyms.
  const source = readFileSync('apps/mobile/www/app.js', 'utf8');
  const search = source.slice(source.indexOf('function search()'), source.indexOf('// One request per pause'));

  assert.match(search, /if \(!r\.ok\) throw/);
});

test('an older search answer cannot overwrite a newer one', () => {
  const source = readFileSync('apps/mobile/www/app.js', 'utf8');
  const search = source.slice(source.indexOf('function search()'), source.indexOf('// One request per pause'));

  assert.match(search, /var mine = \+\+searchSeq/);
  // Both the success and the failure path check it.
  assert.equal(search.match(/if \(mine !== searchSeq\) return;/g)?.length, 2);
});
