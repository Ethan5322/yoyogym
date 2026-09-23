// Turning stored values into things a person reads.
//
// The panel showed 2026-09-23T14:32:07.481Z in ten places. That is a
// serialisation format, not a date, and a screen full of them charges the
// reader a translation on every line.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { when, absolute, exact, money, count, until } from '../platform/format.js';

const NOW = new Date('2026-09-23T14:00:00Z');
const ago = (s) => new Date(NOW.getTime() - s * 1000).toISOString();
const ahead = (d) => new Date(NOW.getTime() + d * 86400000).toISOString();

// ---------------------------------------------------------------------------
// Recent things read relatively, old things read absolutely
// ---------------------------------------------------------------------------

test('recent events read as time since', () => {
  assert.equal(when(ago(10), NOW), 'just now');
  assert.equal(when(ago(60), NOW), '1 minute ago');
  assert.equal(when(ago(3600), NOW), '1 hour ago');
  assert.equal(when(ago(7200), NOW), '2 hours ago');
  assert.equal(when(ago(86400), NOW), 'yesterday');
  assert.equal(when(ago(3 * 86400), NOW), '3 days ago');
});

test('OLD EVENTS READ AS A DATE, because nobody counts 1,847 hours', () => {
  assert.equal(when(ago(30 * 86400), NOW), '24 Aug 2026');
});

test('a future date is said as a date, not as a countdown', () => {
  // "in 27 days" is harder to plan around than the day itself.
  assert.equal(when(ahead(27), NOW), '20 Oct 2026');
});

// ---------------------------------------------------------------------------
// Unambiguous dates
// ---------------------------------------------------------------------------

test('the month is a WORD, so the date cannot be misread', () => {
  // 09/10 is September in one country and October in another. "23 Sep 2026"
  // is the same everywhere, which matters for a product meant to be worldwide.
  assert.equal(absolute('2026-09-23T14:00:00Z'), '23 Sep 2026');
  assert.ok(!/\d{2}\/\d{2}/.test(absolute('2026-09-23T14:00:00Z')));
});

test('the audit log keeps the hour, because that is what it is for', () => {
  assert.equal(exact('2026-09-23T14:32:00Z'), '23 Sep 2026, 14:32');
});

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

test('money NEVER rounds to whole units', () => {
  // R499.50 shown as "R500" is a different price, and somebody will argue
  // about the difference eventually.
  assert.equal(money(49950), 'ZAR 499.50');
  assert.equal(money(49900), 'ZAR 499.00');
  assert.equal(money(1), 'ZAR 0.01');
});

test('a missing amount is a dash, not zero', () => {
  // An unknown price and a free plan are different facts.
  assert.equal(money(null), '—');
  assert.equal(money(undefined), '—');
  assert.equal(money(0), 'ZAR 0.00');
});

// ---------------------------------------------------------------------------
// Counts and deadlines
// ---------------------------------------------------------------------------

test('zero is said in words, because a sentence reads better than a cell', () => {
  assert.equal(count(0, 'gym'), 'No gyms');
  assert.equal(count(1, 'gym'), '1 gym');
  assert.equal(count(12, 'gym'), '12 gyms');
});

test('a deadline reads as a deadline', () => {
  // Compared by CALENDAR DAY, not elapsed hours. From 14:00, half a day later
  // is 02:00 the NEXT day and genuinely is tomorrow — my first fixture here
  // was wrong about that, not the code. Four hours later is still today.
  assert.equal(until(new Date(NOW.getTime() + 4 * 3600_000).toISOString(), NOW), 'today');
  assert.equal(until(ahead(1), NOW), 'tomorrow');
  assert.equal(until(ahead(5), NOW), 'in 5 days');
  assert.equal(until(ahead(40), NOW), '2 Nov 2026');
});

test('a passed deadline says so rather than counting backwards', () => {
  assert.match(until(ago(5 * 86400), NOW), /passed/);
});

// ---------------------------------------------------------------------------
// Rubbish in
// ---------------------------------------------------------------------------

test('nothing and nonsense both become a dash, never "Invalid Date"', () => {
  for (const bad of [null, undefined, '', 'not a date', {}]) {
    assert.equal(when(bad, NOW), '—');
    assert.equal(absolute(bad), '—');
    assert.equal(exact(bad), '—');
    assert.equal(until(bad, NOW), '—');
  }
});

test('a trial ending late tonight still says today', () => {
  // The day somebody has to act is the day it should name. Rounding elapsed
  // hours upward called this tomorrow, which is wrong on the one day it
  // matters.
  const lateTonight = '2026-09-23T23:30:00Z';
  assert.equal(until(lateTonight, NOW), 'today');
});

test('a trial ending just after midnight says tomorrow', () => {
  assert.equal(until('2026-09-24T00:30:00Z', NOW), 'tomorrow');
});
