// The production audit (CLAUDE.md §46): database messages never reach the
// browser, search text cannot change a filter, every router refuses oversized
// bodies and floods, and every database call has a deadline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { failed, filterText, codeText } from '../server/lib/http.js';
import { guardRequest, resetGuard, MAX_BODY_BYTES, MAX_PHOTO_BODY_BYTES } from '../server/lib/guard.js';
import { timedFetch } from '../shared/timed-fetch.js';

function fakeRes() {
  const res = { code: 0, headers: {}, body: '' };
  res.status = (c) => { res.code = c; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; return res; };
  res.end = (b) => { res.body = b; };
  return res;
}

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
  });
}

test('a database failure tells the person in plain words — never the database\'s own message', () => {
  const logged = [];
  const orig = console.error;
  console.error = (...a) => logged.push(a.join(' '));
  try {
    const res = fakeRes();
    failed(res, { code: '23505', message: 'duplicate key value violates unique constraint "members_phone_key" Key (phone)=(0821234567) already exists.' });
    assert.equal(res.code, 500);
    const body = JSON.parse(res.body);
    assert.equal(body.error, 'Something went wrong on our side. Please try again.');
    assert.doesNotMatch(res.body, /members_phone_key|0821234567|constraint/);
    // The cause is logged for us — with the clashing value masked.
    assert.match(logged.join('\n'), /23505/);
    assert.doesNotMatch(logged.join('\n'), /0821234567/);
  } finally {
    console.error = orig;
  }
});

test('no handler sends a raw error message to the browser any more', () => {
  const offenders = walk('server/handlers').filter((p) =>
    /serverError\(res, (?:[A-Za-z]+\.)*(?:error|err|e|[a-z]+Err)\.message\)/.test(readFileSync(p, 'utf8'))
  );
  assert.deepEqual(offenders, []);
});

test('search text cannot add a condition to a filter', () => {
  assert.equal(filterText('ann,status.eq.active'), 'ann status.eq.active');
  assert.equal(filterText('x%),id.neq.0'), 'x id.neq.0');
  assert.equal(filterText('*'), '');
  assert.equal(filterText("O'Brien +27 82"), "O'Brien +27 82");
  assert.equal(filterText('a'.repeat(200)).length, 80);
  assert.equal(codeText(' gym-2026-abc123 '), 'GYM-2026-ABC123');
  assert.equal(codeText('X,verification_code.neq.0'), 'XVERIFICATIONCODENEQ0', 'no comma, dot or underscore survives');
});

test('the gym admin searches clean their text before it reaches a filter', () => {
  for (const [file, helper] of [
    ['server/handlers/admin/members.js', 'filterText'],
    ['server/handlers/admin/audit.js', 'filterText'],
    ['server/handlers/admin/verify.js', 'codeText'],
    ['server/handlers/admin/resolve-member.js', 'codeText'],
  ]) {
    assert.match(readFileSync(file, 'utf8'), new RegExp(`= ${helper}\\(`), file);
  }
});

test('a body larger than the route allows is refused before anything reads it', () => {
  resetGuard();
  const big = { headers: { 'content-length': String(MAX_BODY_BYTES + 1), 'x-real-ip': '198.51.100.1' } };
  const res = fakeRes();
  assert.equal(guardRequest(big, res), false);
  assert.equal(res.code, 413);
  // A face photo route may send more — up to its own limit.
  assert.equal(guardRequest(big, fakeRes(), { maxBytes: MAX_PHOTO_BODY_BYTES }), true);
  const huge = { headers: { 'content-length': String(MAX_PHOTO_BODY_BYTES + 1), 'x-real-ip': '198.51.100.1' } };
  assert.equal(guardRequest(huge, fakeRes(), { maxBytes: MAX_PHOTO_BODY_BYTES }), false);
});

test('one address flooding the API is slowed down; others are not', () => {
  resetGuard();
  const from = (ip) => ({ headers: { 'x-real-ip': ip } });
  for (let i = 0; i < 300; i++) assert.equal(guardRequest(from('203.0.113.9'), fakeRes()), true);
  const res = fakeRes();
  assert.equal(guardRequest(from('203.0.113.9'), res), false);
  assert.equal(res.code, 429);
  assert.ok(Number(res.headers['Retry-After']) > 0);
  assert.equal(guardRequest(from('203.0.113.10'), fakeRes()), true, 'a different address is untouched');
  // No reported address: never all lumped into one bucket.
  for (let i = 0; i < 400; i++) assert.equal(guardRequest({ headers: {} }, fakeRes()), true);
});

test('every API router guards size and rate first', () => {
  for (const file of ['api/[...path].js', 'api/admin/[...path].js', 'api/auth/[...path].js', 'api/member/[...path].js', 'api/platform/[...path].js']) {
    assert.match(readFileSync(file, 'utf8'), /if \(!guardRequest\(req, res/, file);
  }
});

test('every database client has a deadline', () => {
  for (const file of ['server/lib/supabase.js', 'server/lib/tenancy.js', 'server/lib/tenancy-deps.js', 'server/lib/member-index.js', 'platform/deps.js']) {
    const src = readFileSync(file, 'utf8');
    const clients = (src.match(/createClient\(/g) || []).length;
    const timed = (src.match(/global: \{ fetch: timedFetch \}/g) || []).length;
    assert.ok(clients > 0 && timed >= clients, `${file}: ${timed} of ${clients}`);
  }
});

test('the deadline is added, and a caller\'s own signal is kept', async () => {
  const seen = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, init) => { seen.push(init.signal); return { ok: true }; };
  try {
    await timedFetch('https://example.invalid/rest/v1/x', {});
    assert.ok(seen[0] instanceof AbortSignal);
    const mine = new AbortController().signal;
    await timedFetch('https://example.invalid/rest/v1/x', { signal: mine });
    assert.equal(seen[1], mine);
  } finally {
    globalThis.fetch = orig;
  }
});
