// Deleting an account — members and gym owners, in the app and on the web.
//
// What was there: a member could ASK (a flag), and an owner could erase a
// member from that member's own page. What was missing:
//
//   · the erasure left the member in the platform's "which gym did I join?"
//     index, so the platform could still say which gym they belonged to;
//   · a request only showed on that member's own page, which nobody opens
//     unprompted — it could sit unanswered indefinitely;
//   · a gym owner could not close their own account at all;
//   · there was no web page explaining how, which both stores require.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.PLATFORM_JWT_SECRET ||= 'test-only-platform-secret-distinct';

import { handlePlatform } from '../platform/router.js';
import { signPlatformToken } from '../platform/http.js';
import { deleteAccountPage, ownerDashboardPage, dashboardPage } from '../platform/views.js';

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

test('ERASING A MEMBER ALSO REMOVES THEM FROM THE PLATFORM\'S GYM LOOKUP', () => {
  const handler = readFileSync('server/handlers/admin/member.js', 'utf8');
  const del = handler.slice(handler.indexOf("req.method === 'DELETE'"), handler.indexOf("req.method === 'PATCH'"));

  // Read first — the number and phone are gone once the row is.
  assert.ok(del.indexOf("select('membership_number, phone')") < del.indexOf('.delete()'));
  assert.match(del, /unindexMember\(/);
});

test('a lookup entry that could not be removed is REPORTED to the owner', () => {
  // They are carrying out a legal request and must know if part of it failed.
  const handler = readFileSync('server/handlers/admin/member.js', 'utf8');
  assert.match(handler, /index_cleared: unfiled\.ok/);
  assert.match(readFileSync('src/pages/admin/MemberDetail.jsx', 'utf8'), /if \(result\?\.warning\) alert/);
});

test('removing from the lookup is scoped to THIS gym', () => {
  // Erasing someone at one gym must not unfile them at another.
  const index = readFileSync('server/lib/member-index.js', 'utf8');
  const fn = index.slice(index.indexOf('export async function unindexMember'));
  assert.match(fn, /\.eq\('lookup_hash', hash\)\.eq\('gym_id', gym\.id\)/);
});

test('A MEMBER\'S REQUEST IS ON THE OWNER\'S DASHBOARD, BY NAME', () => {
  const handler = readFileSync('server/handlers/admin/dashboard.js', 'utf8');
  assert.match(handler, /\.eq\('data_deletion_requested', true\)/);
  assert.match(handler, /deletion_requests: deletionRequests/);
  const page = readFileSync('src/pages/admin/Dashboard.jsx', 'utf8');
  assert.match(page, /d\.deletion_requests/);
  assert.match(page, /to=\{`\/admin\/members\/\$\{m\.id\}`\}/, 'each links to where the erasure is done');
});

// ---------------------------------------------------------------------------
// The web route
// ---------------------------------------------------------------------------

test('THERE IS A WEB PAGE FOR DELETION THAT NEEDS NO APP', async () => {
  const r = { statusCode: 0, headers: {}, body: '', setHeader() {}, getHeader() {}, writeHead(c) { this.statusCode = c; return this; }, end(b) { this.body = b; } };
  await handlePlatform({ method: 'GET', url: '/platform/delete-account', headers: {} }, r, {});
  assert.equal(r.statusCode, 200);
  assert.match(r.body, /Delete your account/);
});

test('the page explains for members AND owners, and deletes nothing itself', () => {
  // A form that erased on a number and phone would let anyone who knew those
  // two things delete somebody else.
  const page = deleteAccountPage();
  assert.match(page, /If you are a gym member/);
  assert.match(page, /If you own a gym/);
  assert.ok(!/<form/.test(page), 'no form on this page');
});

test('the member instructions match the real button, on the real screen', () => {
  // The button is at the bottom of the Status tab, labelled "Request data deletion".
  const portal = readFileSync('src/pages/MemberPortal.jsx', 'utf8');
  assert.match(portal, /Request data deletion/);
  assert.match(deleteAccountPage(), /<b>Status<\/b> screen[\s\S]*Request data deletion/);
});

// ---------------------------------------------------------------------------
// Owners
// ---------------------------------------------------------------------------

test('AN OWNER CAN ASK TO CLOSE THEIR ACCOUNT, AND THE PAGE SAYS WHAT HAPPENS', () => {
  const page = ownerDashboardPage({ csrfToken: 't' });
  assert.match(page, /action="\/platform\/my-gym\/close"/);
  assert.match(page, /name="csrf"/);
  assert.match(page, /90 days/);
  assert.match(page, /Download anything you want to keep/);
});

test('once asked, the page shows the request instead of the button', () => {
  const page = ownerDashboardPage({ closureRequestedAt: '2026-09-24T10:00:00Z' });
  assert.ok(!/action="\/platform\/my-gym\/close"/.test(page));
  assert.match(page, /You asked to close your account/);
});

test('the request needs a session and a CSRF token', async () => {
  let asked = false;
  const deps = { requestClosure: async () => { asked = true; } };
  const raw = 'csrf=wrong';
  const req = { method: 'POST', url: '/platform/my-gym/close', headers: { 'content-type': 'application/x-www-form-urlencoded' } };
  req[Symbol.asyncIterator] = async function* () { yield Buffer.from(raw); };
  const r = { statusCode: 0, headers: {}, setHeader() {}, getHeader() {}, writeHead(c) { this.statusCode = c; return this; }, end() {} };
  await handlePlatform(req, r, deps);
  assert.equal(asked, false);
});

test('the app can ask too, through the same dependency', async () => {
  let asked = null;
  const deps = { requestClosure: async (id) => { asked = id; } };
  const token = signPlatformToken({ id: 'owner-1', email: 'ann@bos.co', kind: 'gym_owner' });
  const req = { method: 'POST', url: '/platform/api/my-gym/close', headers: { authorization: `Bearer ${token}` } };
  req[Symbol.asyncIterator] = async function* () {};
  const r = { statusCode: 0, headers: {}, body: '', setHeader() {}, getHeader() {}, writeHead(c) { this.statusCode = c; return this; }, end(b) { this.body = b; } };
  await handlePlatform(req, r, deps);
  assert.equal(r.statusCode, 202);
  assert.equal(asked, 'owner-1', 'the account comes from the session, never the body');
});

test('platform staff see closure requests first thing', () => {
  const page = dashboardPage({ closureRequests: 2 });
  assert.match(page, /2 owners asked to close their account/);
});

test('the column exists in both schema files, and the owner list survives without it', () => {
  for (const f of ['platform/schema.sql', 'platform/RUN-THIS.sql']) {
    assert.match(readFileSync(f, 'utf8'), /add column if not exists closure_requested_at/);
  }
  // Before the migration runs, the owner list must not come back EMPTY.
  const deps = readFileSync('platform/deps.js', 'utf8');
  assert.match(deps, /if \(result\.error\) result = await build\(BASE\);/);
});
