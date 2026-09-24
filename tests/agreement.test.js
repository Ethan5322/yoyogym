// A new gym owner leaves activation with an Owner ID and a PDF agreement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.PLATFORM_JWT_SECRET ||= 'test-only-platform-secret-distinct';

const { ownerId, agreementTerms, agreementPdf, AGREEMENT_VERSION, termsApproved } = await import('../platform/agreement.js');
const { TRIAL_DAYS, GRACE_DAYS } = await import('../platform/billing.js');
const { handlePlatform } = await import('../platform/router.js');
const { termsPage } = await import('../platform/views.js');

const ID = '3f9a12c4-0b1e-4c5d-9e8f-1a2b3c4d5e6f';

test('AN OWNER ID IS PERMANENT, READABLE, AND DERIVED FROM THE ACCOUNT', () => {
  assert.equal(ownerId(ID), 'YG-OWN-3F9A12C4');
  assert.equal(ownerId(ID), ownerId(ID), 'the same every time');
  assert.equal(ownerId(''), null);
});

test('THE TERMS STATE THE TRIAL AND GRACE PERIODS THE SYSTEM ACTUALLY USES', () => {
  const text = agreementTerms().map((s) => s.body).join(' ');
  assert.match(text, new RegExp(`${TRIAL_DAYS}-day free trial`));
  assert.match(text, new RegExp(`${GRACE_DAYS} days' grace`));
  assert.ok(!/deleted \d+ days later/.test(text), 'no automatic deletion is promised (D-071)');
});

test('the agreement is a draft until someone approves it', () => {
  assert.equal(termsApproved({}), false);
  assert.equal(termsApproved({ PLATFORM_TERMS_APPROVED: 'true' }), true);
  assert.match(termsPage({ sections: agreementTerms(), version: AGREEMENT_VERSION }), /DRAFT/);
  assert.ok(!/DRAFT/.test(termsPage({ sections: agreementTerms(), version: AGREEMENT_VERSION, approved: true })));
});

test('THE PDF IS A REAL PDF CARRYING THE OWNER\'S DETAILS', async () => {
  const pdf = await agreementPdf({
    ownerId: ownerId(ID),
    ownerName: 'Ann Owner',
    ownerEmail: 'ann@bos.co',
    gymName: 'BOS GYM',
    gymAddress: 'https://yoyogym.vercel.app/g/bos-gym/admin/login',
    gymUsername: 'owner',
    planLabel: 'Medium',
    priceText: 'ZAR 499.00 a month',
    trialEndsAt: '2026-10-24T00:00:00Z',
    acceptedAt: '2026-09-24T10:00:00Z',
    acceptedVersion: AGREEMENT_VERSION,
    approved: false,
  });
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  const text = pdf.toString('latin1');
  for (const expected of ['YG-OWN-3F9A12C4', 'BOS GYM', 'Ann Owner', 'bos-gym/admin/login', 'DRAFT']) {
    assert.ok(text.includes(expected), `the PDF says "${expected}"`);
  }
});

test('ONLY A SIGNED-IN OWNER CAN DOWNLOAD IT', async () => {
  const r = { statusCode: 0, headers: {}, body: '', setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, getHeader() {}, writeHead(c, h) { this.statusCode = c; Object.assign(this.headers, h || {}); return this; }, end(b) { this.body = b; } };
  await handlePlatform({ method: 'GET', url: '/platform/my-gym/agreement.pdf', headers: {} }, r, {});
  assert.notEqual(r.statusCode, 200, 'no session, no PDF');
});

test('and it is only ever THEIR gym — keyed on the session, never the address', () => {
  const router = readFileSync('platform/router.js', 'utf8');
  const route = router.slice(router.indexOf("path === 'my-gym/agreement.pdf'"), router.indexOf('the privacy policy — a draft'));
  assert.match(route, /deps\.ownerDashboard\(session\.sub\)/);
  assert.ok(!/searchParams/.test(route), 'nothing in the URL chooses whose agreement');
});

test('the terms are readable before accepting, from the activation page', async () => {
  const { activatePage } = await import('../platform/views.js');
  const page = activatePage({ token: 't' });
  assert.match(page, /name="accept_terms"/);
  assert.match(page, /href="\/platform\/terms"/);
});
