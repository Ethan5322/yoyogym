// Unit tests for multi-template face gallery matching.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cosine,
  euclidean,
  arcfaceSimilarity,
  faceApiSimilarity,
  templatesOf,
  identify,
  shouldLearn,
  enrolmentGallery,
  withLearnedTemplate,
} from '../server/lib/facematch.js';

// Unit vectors in 3-D stand in for real embeddings; only the geometry matters.
const unit = (x, y, z) => {
  const n = Math.hypot(x, y, z);
  return [x / n, y / n, z / n];
};

const opts = { similarity: arcfaceSimilarity, threshold: 0.38, margin: 0.05 };

test('cosine and euclidean handle mismatched or missing vectors', () => {
  assert.equal(cosine([1, 0], [1, 0, 0]), -1);
  assert.equal(cosine(null, [1]), -1);
  assert.equal(euclidean([1, 0], null), Infinity);
  assert.equal(euclidean([3, 0], [0, 4]), 5);
});

test('templatesOf reads the gallery, preferring it over the legacy column', () => {
  const row = { g: [{ v: [1, 2] }, { v: [3, 4] }], legacy: [9, 9] };
  assert.deepEqual(templatesOf(row, { arrayKey: 'g', legacyKey: 'legacy' }), [[1, 2], [3, 4]]);
});

test('templatesOf falls back to the legacy single-vector column', () => {
  const row = { g: [], legacy: [9, 9] };
  assert.deepEqual(templatesOf(row, { arrayKey: 'g', legacyKey: 'legacy' }), [[9, 9]]);
});

test('templatesOf accepts bare arrays as gallery entries', () => {
  const row = { g: [[1, 2]] };
  assert.deepEqual(templatesOf(row, { arrayKey: 'g', legacyKey: 'legacy' }), [[1, 2]]);
});

test('a person is scored by their CLOSEST template, not their average', () => {
  // Alice enrolled two looks 90 degrees apart. A probe matching the second one
  // exactly must score 1.0 — averaging the two would score only ~0.71.
  const alice = { id: 'alice', templates: [unit(1, 0, 0), unit(0, 1, 0)] };
  const probe = unit(0, 1, 0);
  const r = identify(probe, [alice], opts);
  assert.equal(r.person.id, 'alice');
  assert.ok(Math.abs(r.score - 1) < 1e-9);
});

test('an appearance change that clears threshold and margin is accepted', () => {
  const alice = { id: 'alice', templates: [unit(1, 0, 0)] };
  const bob = { id: 'bob', templates: [unit(0, 1, 0)] };
  // Alice with a new beard: 0.5 cosine to her template, 0.0 to Bob's.
  const probe = unit(1, 0, 1.732); // cos to (1,0,0) = 0.5
  const r = identify(probe, [alice, bob], opts);
  assert.equal(r.person.id, 'alice');
  assert.equal(r.confident, true);
});

test('a look-alike who beats the threshold but not the margin is rejected', () => {
  const alice = { id: 'alice', templates: [unit(1, 0, 0)] };
  const twin = { id: 'twin', templates: [unit(0.99, 0.14, 0)] };
  const probe = unit(1, 0.07, 0); // nearly equidistant from both
  const r = identify(probe, [alice, twin], opts);
  assert.ok(r.score >= opts.threshold, 'probe clears the absolute threshold');
  assert.equal(r.confident, false, 'but the runner-up is too close to be sure');
});

test('a stranger is rejected outright', () => {
  const alice = { id: 'alice', templates: [unit(1, 0, 0)] };
  const r = identify(unit(0, 1, 0), [alice], opts);
  assert.equal(r.confident, false);
});

test('an empty gallery never yields a confident match', () => {
  const r = identify(unit(1, 0, 0), [], opts);
  assert.equal(r.person, null);
  assert.equal(r.confident, false);
});

test('face-api distances rank the same way through the similarity adapter', () => {
  const near = faceApiSimilarity([0, 0], [0.3, 0]); // distance 0.3
  const far = faceApiSimilarity([0, 0], [0.7, 0]); // distance 0.7
  assert.ok(near > far);
  assert.ok(near >= -0.6, 'a 0.3 distance clears the face-api threshold');
  assert.ok(far < -0.6, 'a 0.7 distance does not');
});

test('learning requires a strong match AND a genuinely new appearance', () => {
  const templates = [unit(1, 0, 0)];
  const cfg = { similarity: arcfaceSimilarity, learnAbove: 0.55, redundantAbove: 0.86 };

  // Strong but nearly identical to what we already store -> nothing to learn.
  assert.equal(shouldLearn(unit(1, 0.1, 0), templates, { ...cfg, score: 0.99 }), false);
  // Strong and meaningfully different -> learn it.
  assert.equal(shouldLearn(unit(1, 0, 0.7), templates, { ...cfg, score: 0.82 }), true);
  // Borderline accept -> never learn, however novel.
  assert.equal(shouldLearn(unit(0, 0, 1), templates, { ...cfg, score: 0.4 }), false);
});

test('enrolment templates become anchors and are capped', () => {
  const g = enrolmentGallery([[1], [2], [3], [4], [5], [6]], { max: 5 });
  assert.equal(g.length, 5);
  assert.ok(g.every((e) => e.src === 'enrol'));
});

test('learning evicts the oldest learned template but never an anchor', () => {
  let g = enrolmentGallery([[1], [2]]);
  for (const v of [[10], [11], [12], [13], [14], [15], [16]]) g = withLearnedTemplate(g, v, { max: 5 });

  assert.equal(g.length, 5);
  const anchors = g.filter((e) => e.src === 'enrol');
  assert.deepEqual(anchors.map((e) => e.v), [[1], [2]], 'both anchors survive');
  const learned = g.filter((e) => e.src === 'adaptive');
  assert.deepEqual(learned.map((e) => e.v), [[14], [15], [16]], 'oldest learned entries were evicted');
});

test('a legacy bare-array gallery is upgraded to anchors on first learn', () => {
  const g = withLearnedTemplate([[1, 2]], [3, 4], { max: 4 });
  assert.equal(g.length, 2);
  assert.equal(g[0].src, 'enrol');
  assert.equal(g[1].src, 'adaptive');
});

test('learning cannot displace anchors when the gallery is all anchors', () => {
  const g = enrolmentGallery([[1], [2], [3]], { max: 3 });
  const after = withLearnedTemplate(g, [4], { max: 3 });
  assert.equal(after.length, 3);
  assert.ok(after.every((e) => e.src === 'enrol'));
});
