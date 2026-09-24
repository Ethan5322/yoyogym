// Platform emails that actually arrive, with links that actually open.
//
// Found when the user tried "Forgot your password?": no email came. Two
// reasons, both affecting activation and billing emails too:
//
//   1. The sender defaulted to no-reply@yoyogyms.com — a domain nobody has
//      registered — and Brevo delivers only from verified senders.
//   2. With PLATFORM_BASE_URL unset, links were "/platform/reset?token=…":
//      no site in front, unopenable from a mail app. The Paystack callback
//      had the same flaw, so a paying owner was not sent back anywhere real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { platformBaseUrl } from '../platform/base-url.js';
import { platformSender } from '../platform/email.js';

// ---------------------------------------------------------------------------
// The sender
// ---------------------------------------------------------------------------

test('PLATFORM EMAIL COMES FROM THE VERIFIED BREVO SENDER WHEN NO OTHER IS SET', () => {
  assert.equal(platformSender({ BREVO_SENDER_EMAIL: 'gym@example.com' }).email, 'gym@example.com');
});

test('an explicit platform sender still wins', () => {
  assert.equal(
    platformSender({ PLATFORM_FROM_EMAIL: 'hello@yoyo.example', BREVO_SENDER_EMAIL: 'gym@example.com' }).email,
    'hello@yoyo.example'
  );
});

// ---------------------------------------------------------------------------
// The links
// ---------------------------------------------------------------------------

test('AN EXPLICIT BASE URL IS USED AS GIVEN, WITHOUT A TRAILING SLASH', () => {
  assert.equal(platformBaseUrl({ PLATFORM_BASE_URL: 'https://yoyogyms.com/' }), 'https://yoyogyms.com');
});

test('in production, links use the stable production address, not the per-build one', () => {
  assert.equal(
    platformBaseUrl({ VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'yoyogym.vercel.app', VERCEL_URL: 'yoyogym-abc123.vercel.app' }),
    'https://yoyogym.vercel.app'
  );
});

test('in a preview, links use the branch address', () => {
  assert.equal(
    platformBaseUrl({ VERCEL_ENV: 'preview', VERCEL_BRANCH_URL: 'yoyogym-git-stage-8-app.vercel.app', VERCEL_URL: 'yoyogym-xyz.vercel.app' }),
    'https://yoyogym-git-stage-8-app.vercel.app'
  );
});

test('EVERY LINK IS ABSOLUTE WHEREVER VERCEL RUNS IT', () => {
  for (const env of [
    { VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'yoyogym.vercel.app' },
    { VERCEL_ENV: 'preview', VERCEL_URL: 'yoyogym-xyz.vercel.app' },
  ]) {
    assert.match(platformBaseUrl(env), /^https:\/\/[a-z0-9.-]+$/);
  }
});

test('NEVER BUILT FROM THE REQUEST — that is password-reset poisoning', () => {
  // A request with Host: attacker.example would make us email a GENUINE
  // reset link pointing at the attacker. The function takes no request.
  assert.equal(platformBaseUrl.length <= 1, true, 'env only');
  const source = readFileSync('platform/base-url.js', 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/headers|\.host\b|req\b/.test(source), 'no request data in the link');
});

test('no platform code builds a link from PLATFORM_BASE_URL directly any more', () => {
  for (const file of ['platform/deps.js', 'platform/email.js', 'platform/router.js', 'platform/api.js']) {
    const code = readFileSync(file, 'utf8').replace(/^\s*(\/\/|\*).*$/gm, '');
    assert.ok(!/process\.env\.PLATFORM_BASE_URL/.test(code), `${file} must use platformBaseUrl()`);
  }
});

test('the reset, activation and payment links all go through it', () => {
  const deps = readFileSync('platform/deps.js', 'utf8');
  assert.match(deps, /callbackUrl: `\$\{platformBaseUrl\(\)\}\/platform\/pay\/callback`/);
  assert.equal((deps.match(/const base = platformBaseUrl\(\)/g) || []).length, 2, 'activation and reset');
});
