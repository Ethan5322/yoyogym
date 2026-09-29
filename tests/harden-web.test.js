// The website hardened after the design critique (2026-09-29): keyboard,
// confirmation before switching anyone off, required reasons, a readable PDF
// fallback, upload errors that look like errors, and the gym's own currency.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.PLATFORM_JWT_SECRET ||= 'test-only-platform-secret-distinct';
process.env.JWT_SECRET ||= 'test-only-gym-secret';

import { layout, ownersPage, teamPage, applicationDetailPage, documentReviewPage, applyDocumentsPage } from '../platform/views.js';

const STAFF = { email: 'me@yoyogyms.com', kind: 'platform_staff', perms: ['application.view', 'application.approve', 'platform.manage', 'gym.view'] };

test('EVERY PAGE STARTS WITH "SKIP TO CONTENT", AND LINKS AND BUTTONS SHOW KEYBOARD FOCUS', () => {
  for (const user of [STAFF, { email: 'o@x', kind: 'gym_owner' }, null]) {
    const page = layout({ title: 'T', body: '<p>x</p>', user });
    assert.match(page, /<a class="skip" href="#main">Skip to content<\/a>/, String(user?.kind));
    assert.match(page, /<main id="main" tabindex="-1">/);
  }
  const page = layout({ title: 'T', body: '', user: STAFF });
  assert.match(page, /a:focus-visible, button:focus-visible, summary:focus-visible/);
});

test('the phone menu switch is not an invisible keyboard stop on a computer', () => {
  const page = layout({ title: 'T', body: '', user: STAFF });
  assert.match(page, /\.navt \{ display:none; \}/);
  assert.match(page, /\.side nav a \{[^}]*min-height:44px/, '44px targets');
});

test('SWITCHING AN OWNER OFF TAKES A SECOND CLICK, AFTER SAYING WHAT HAPPENS', () => {
  const page = ownersPage({ owners: [{ id: 'o1', email: 'kuma@example.com', full_name: 'Kuma', is_active: true }], user: STAFF, csrfToken: 't' });
  assert.match(page, /<details class="confirm"><summary>Switch off<\/summary>/);
  assert.match(page, /can no longer sign in to their Yoyo Gyms account/);
  assert.match(page, /Their gym stays open/);
  assert.match(page, /Yes, switch off/);
  assert.doesNotMatch(page, /<button type="submit" class="danger">Switch off<\/button>/, 'no one-click switch-off');
});

test('switching a Yoyo team member off takes a second click too', () => {
  const page = teamPage({ staff: [{ id: 's1', email: 'z@yoyo.co', full_name: 'Zola', is_active: true, roles: ['platform_support'] }], user: STAFF, csrfToken: 't', me: 'someone-else' });
  if (/Switch off/.test(page)) {
    assert.match(page, /<details class="confirm"><summary>Switch off<\/summary>/);
    assert.match(page, /loses the main admin panel from their next click/);
  }
});

test('REJECTING OR ASKING FOR MORE NEEDS A MESSAGE; APPROVING AND ACCEPTING DO NOT', () => {
  const page = applicationDetailPage({
    application: { id: 'a1', status: 'submitted', proposed_gym_name: 'Bos' },
    documents: [{ id: 'd1', doc_type: 'id_document', status: 'pending', filename: 'id.pdf' }],
    csrfToken: 't',
  });
  assert.match(page, /<textarea name="reason" rows="3" required/);
  assert.match(page, /value="approve" formnovalidate/);
  assert.match(page, /<input name="reason" required aria-label="Reason for rejecting this document"/);
  assert.match(page, /value="accept" formnovalidate/);
});

test('when a browser cannot show a PDF, its message is readable on the white viewer box', () => {
  const page = documentReviewPage({ doc: { id: 'd1', mime_type: 'application/pdf', filename: 'id.pdf', doc_type: 'id_document' } });
  assert.match(page, /<div class="empty" style="color:#1d2329;[^"]*background:#fff">\s*<p>This browser cannot show the PDF here/);
});

test('an upload error on the application reads as an error, not grey progress text', () => {
  const page = applyDocumentsPage({ application: { id: 'a1', proposed_gym_name: 'Bos' }, documents: [], csrfToken: 't' });
  assert.match(page, /function say\(text, isError\)/);
  assert.match(page, /note\.className = 'doc-note ' \+ \(isError \? 'err' : 'muted'\)/);
  assert.match(page, /say\('The upload did not finish\. Please try again\.', true\)/);
  assert.match(page, /a large photo can take a minute/);
});

test("the gym's public details carry its country, currency and dialling code", async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../server/handlers/public/content.js', import.meta.url), 'utf8');
  assert.match(src, /currency: currencyForCountry\(country\)/);
  assert.match(src, /dial: dialForCountry\(country\) \|\| null/);
  const { currencyForCountry, dialForCountry } = await import('../shared/countries.js');
  assert.equal(currencyForCountry('ET'), 'ETB');
  assert.equal(dialForCountry('ET'), '251');
});
