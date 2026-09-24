// Telling a member the gym is shut BEFORE they fill in the form.
//
// Gym resolution answers precisely — 404 the gym does not exist, 402 it is
// provisioned but not paid for, 403 it is suspended, 503 it is unreachable —
// and the client threw every one of those away in a `.catch(() => ({}))`.
//
// So a member scanned a suspended gym's QR, got the ordinary screens with
// default colours, worked through a 38-step registration form, and found out
// at the end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { gymGate } from '../src/lib/gymGate.js';

const SLUG = 'bos-gym';

// ---------------------------------------------------------------------------
// The four answers
// ---------------------------------------------------------------------------

test('EACH RESOLUTION FAILURE GETS ITS OWN ANSWER', () => {
  // Four different situations. One message for all of them would be the same
  // mistake as none at all.
  const seen = new Set();

  for (const status of [402, 403, 404, 503]) {
    const gate = gymGate(status, SLUG);
    assert.ok(gate, `status ${status} must be explained`);
    assert.ok(gate.title && gate.detail && gate.action, `status ${status} needs all three`);
    seen.add(gate.title);
  }

  assert.equal(seen.size, 4, 'and the four are actually different');
});

test('A MEMBER IS NEVER TOLD THEIR GYM HAS NOT PAID', () => {
  // 402 means the owner owes us money. That is the gym's business, and
  // "your gym has not paid" is a sentence that damages a gym in front of its
  // own customers.
  const gate = gymGate(402, SLUG);
  const words = `${gate.title} ${gate.detail}`.toLowerCase();

  for (const leak of ['paid', 'payment', 'invoice', 'subscription', 'billing', 'owes']) {
    assert.ok(!words.includes(leak), `"${leak}" must not appear`);
  }
});

test('a suspended gym does not sound like lost data', () => {
  // The first thing a member fears is that their membership is gone.
  const gate = gymGate(403, SLUG);
  assert.match(gate.detail, /safe/i);
});

test('ONLY THE 503 OFFERS A RETRY', () => {
  // "Try again" on a suspended gym is a button that cannot work. On a 503 it
  // is the honest advice.
  assert.equal(gymGate(503, SLUG).retryable, true);

  for (const status of [402, 403, 404]) {
    assert.ok(!gymGate(status, SLUG).retryable, `status ${status} has nothing to retry`);
  }
});

test('an unknown gym blames nobody', () => {
  // An expired QR code and a mistyped link look identical from here.
  const gate = gymGate(404, SLUG);
  assert.ok(!/invalid|wrong|error/i.test(gate.detail));
});

// ---------------------------------------------------------------------------
// When it must NOT fire
// ---------------------------------------------------------------------------

test('SINGLE-GYM MODE IS NEVER GATED', () => {
  // No slug means nothing to resolve. Blocking the existing deployment on a
  // dropped request would break it to fix a problem it does not have.
  for (const status of [402, 403, 404, 503]) {
    assert.equal(gymGate(status, null), null);
  }
});

test('a server error is not explained as a gym problem', () => {
  // A 500 is ours, not the gym's, and a confident wrong explanation is worse
  // than a spinner.
  assert.equal(gymGate(500, SLUG), null);
  assert.equal(gymGate(null, SLUG), null);
  assert.equal(gymGate(429, SLUG), null);
});

// ---------------------------------------------------------------------------
// That it is actually wired in
// ---------------------------------------------------------------------------

test('THE STATUS IS KEPT RATHER THAN SWALLOWED', () => {
  const source = readFileSync('src/lib/branding.js', 'utf8');

  assert.match(source, /export function brandingFailure/);
  assert.match(source, /failedStatus = err\?\.status/);
  assert.ok(!/\.catch\(\(\) => \(\{\}\)\)/.test(source), 'the swallow is gone');
});

test('loadBranding still resolves, so a caller that only wanted a colour is unaffected', () => {
  const source = readFileSync('src/lib/branding.js', 'utf8');
  const handler = source.slice(source.indexOf('.catch('), source.indexOf('return inflight'));

  assert.match(handler, /return \{\};/, 'it returns, it does not rethrow');
});

test('THE GATE RUNS BEFORE THE ROUTES', () => {
  // Rendering it after the routes would mean the registration form mounts
  // first, which is the bug.
  const source = readFileSync('src/App.jsx', 'utf8');

  const gateAt = source.indexOf('if (gate) return <GymUnavailable');
  const routesAt = source.indexOf('<Routes>');

  assert.ok(gateAt > -1, 'the gate must be rendered');
  assert.ok(gateAt < routesAt, 'and before any route');
});

test('the gate is fed the slug captured from the URL', () => {
  const source = readFileSync('src/App.jsx', 'utf8');
  assert.match(source, /const slug = captureGym\(\)/);
  assert.match(source, /gymGate\(brandingFailure\(\), slug\)/);
});
