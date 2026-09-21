// Platform view tests, written before the views.
//
// These pages are server-rendered HTML containing text a stranger typed: gym
// names, document filenames, rejection reasons. **Escaping is the whole
// security story here**, so most of these tests are about that rather than
// about layout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, layout, loginPage, applicationsPage, applicationDetailPage } from '../platform/views.js';

test('escapeHtml neutralises every character that can break out of markup', () => {
  assert.equal(escapeHtml('<script>'), '&lt;script&gt;');
  assert.equal(escapeHtml('a & b'), 'a &amp; b');
  assert.equal(escapeHtml('say "hi"'), 'say &quot;hi&quot;');
  assert.equal(escapeHtml("it's"), 'it&#39;s');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(42), '42');
});

test('a gym name containing a script tag cannot execute', () => {
  const html = applicationsPage({
    applications: [
      { id: 'a1', proposed_gym_name: '<script>alert(1)</script>', status: 'submitted', city: 'Cape Town', submitted_at: '2026-09-21' },
    ],
  });

  assert.ok(!html.includes('<script>alert(1)</script>'), 'the raw tag must never reach the page');
  assert.ok(html.includes('&lt;script&gt;'), 'it appears escaped instead');
});

test('a rejection reason containing markup is escaped', () => {
  const html = applicationDetailPage({
    application: { id: 'a1', proposed_gym_name: 'Iron Works', status: 'rejected', decision_reason: '<img src=x onerror=alert(1)>' },
    documents: [],
    events: [],
  });

  assert.ok(!html.includes('<img src=x'), 'no raw markup from user text');
  assert.ok(html.includes('&lt;img'));
});

test('a malicious document filename is escaped in the list', () => {
  const html = applicationDetailPage({
    application: { id: 'a1', proposed_gym_name: 'Iron Works', status: 'submitted' },
    documents: [{ id: 'd1', doc_type: 'owner_id', filename: '"><script>steal()</script>', status: 'pending' }],
    events: [],
  });

  assert.ok(!html.includes('<script>steal()'), 'a filename cannot break out of an attribute');
});

test('an event reason from a reviewer is escaped too', () => {
  // Staff input is still input.
  const html = applicationDetailPage({
    application: { id: 'a1', proposed_gym_name: 'Iron Works', status: 'info_requested' },
    documents: [],
    events: [{ event: 'info_requested', reason: '<b>resend</b>', created_at: '2026-09-21' }],
  });

  assert.ok(!html.includes('<b>resend</b>'));
  assert.ok(html.includes('&lt;b&gt;resend'));
});

test('the layout is a complete, self-contained document with no inline handlers', () => {
  const html = layout({ title: 'Applications', body: '<p>hello</p>' });

  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('<title>Applications'));
  assert.ok(html.includes('<p>hello</p>'), 'the body is inserted as trusted markup the caller built');
  assert.ok(!/ on[a-z]+=/i.test(html), 'no inline event handlers, so a strict CSP stays possible');
});

test('the page title is escaped as well', () => {
  const html = layout({ title: '</title><script>x()</script>', body: '' });
  assert.ok(!html.includes('<script>x()'));
});

test('the login page carries no session details and no hints', () => {
  const html = loginPage({ error: 'Invalid email or password' });

  assert.ok(html.includes('Invalid email or password'), 'the generic error is shown');
  assert.ok(html.includes('type="password"'));
  assert.ok(html.includes('name="totp"'), 'the second factor is asked for at sign-in');
  assert.ok(!/token|secret|jwt/i.test(html), 'nothing session-ish is ever rendered into the page');
});

test('an empty applications list renders an empty state, not a broken table', () => {
  const html = applicationsPage({ applications: [] });
  assert.ok(/no applications/i.test(html));
  assert.ok(!html.includes('<tbody></tbody>'), 'an empty table body is not an empty state');
});

test('applications render with the detail a reviewer needs to triage', () => {
  const html = applicationsPage({
    applications: [{ id: 'a1', proposed_gym_name: 'Iron Works', status: 'submitted', city: 'Cape Town', submitted_at: '2026-09-21' }],
  });

  assert.ok(html.includes('Iron Works'));
  assert.ok(html.includes('submitted'));
  assert.ok(html.includes('Cape Town'));
  assert.ok(html.includes('/platform/applications/a1'), 'each row links to its review page');
});
