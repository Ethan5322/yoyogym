// Platform email, and the thing it fixes.
//
// The bug this exists for: approving a gym provisioned a real database and
// generated an activation link, and then nothing sent it and nothing showed
// it. The link was created and thrown away. The owner could never activate, so
// the gym never opened — the onboarding chain broke at the very last step.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sendEmail, emailConfigured, activationEmail, decisionEmail, billingEmail } from '../platform/email.js';

// ---------------------------------------------------------------------------
// Degrading, not throwing
// ---------------------------------------------------------------------------

test('with no provider configured, sending reports failure instead of throwing', async () => {
  // A failed email must never undo a decision. Approving a gym creates a real
  // database; losing that because a mail API is unset would be absurd.
  delete process.env.BREVO_API_KEY;

  assert.equal(emailConfigured(), false);
  const result = await sendEmail({ to: 'a@b.co', subject: 'x', html: '<p>x</p>' });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'email_not_configured');
});

test('a missing recipient is reported, not sent into the void', async () => {
  process.env.BREVO_API_KEY = 'test-key-not-used';
  try {
    const result = await sendEmail({ to: '', subject: 'x', html: '<p>x</p>' });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'no_recipient');
  } finally {
    delete process.env.BREVO_API_KEY;
  }
});

// ---------------------------------------------------------------------------
// The activation email
// ---------------------------------------------------------------------------

test('the activation email carries the link and the code as SEPARATE things', () => {
  // The code exists precisely because it is not in the URL. A link gets
  // forwarded, logged by mail providers and pasted into chats; the code proves
  // the person using it is the person the email reached.
  const mail = activationEmail({
    gymName: 'BOS GYM',
    link: 'https://yoyogyms.com/platform/activate?token=abc123',
    code: '481920',
  });

  assert.match(mail.html, /abc123/, 'the link is there');
  assert.match(mail.html, /481920/, 'and so is the code');
  assert.ok(!mail.html.includes('token=abc123&code=481920'), 'but the code is NOT in the URL');
  assert.match(mail.text, /481920/, 'plain text works too — many clients prefer it');
});

test('the activation email says when the link dies', () => {
  const mail = activationEmail({ gymName: 'BOS GYM', link: 'https://x', code: '000000' });
  assert.match(mail.html, /48 hours/);
});

test('a gym name with HTML in it cannot break the email', () => {
  const mail = activationEmail({
    gymName: '<script>alert(1)</script>',
    link: 'https://x',
    code: '000000',
  });

  assert.ok(!mail.html.includes('<script>alert(1)</script>'));
});

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

test('a rejection carries the reason, so the owner can act on it', () => {
  const mail = decisionEmail({ gymName: 'BOS GYM', decision: 'rejected', reason: 'Registration expired' });

  assert.match(mail.html, /Registration expired/);
  assert.match(mail.html, /apply again/i, 'and says the door is not shut');
});

test('a rejection reason with HTML in it is escaped', () => {
  const mail = decisionEmail({ gymName: 'x', decision: 'rejected', reason: '<b>hi</b>' });
  assert.ok(!mail.html.includes('<b>hi</b>'));
});

// ---------------------------------------------------------------------------
// Billing notices
// ---------------------------------------------------------------------------

test('a failed payment email says plainly that the gym is STILL OPEN', () => {
  // The grace window is meaningless if the email makes the owner think they
  // have been cut off.
  const mail = billingEmail('payment_failed', { gymName: 'BOS GYM', amountCents: 49900 });

  assert.match(mail.html, /still open/i);
  assert.match(mail.html, /499\.00/, 'and the amount is in rands, not cents');
});

test('a suspension email says plainly that NOTHING IS DELETED', () => {
  const mail = billingEmail('gym_suspended', { gymName: 'BOS GYM' });

  assert.match(mail.html, /no data has been deleted/i);
  assert.match(mail.html, /reopens it immediately/i);
});

test('an unknown notice kind produces nothing rather than a blank email', () => {
  assert.equal(billingEmail('wombat', {}), null);
});
