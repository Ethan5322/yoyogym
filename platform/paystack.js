// Paystack, for the PLATFORM's own account.
//
// This is deliberately a separate file from server/lib/paystack.js, and not
// because of the import boundary alone (D-081). The two talk to DIFFERENT
// PAYSTACK ACCOUNTS:
//
//   server/lib/paystack.js  — the GYM's account. The gym's money, the gym's
//                             settlement, the gym as merchant of record.
//   platform/paystack.js    — OUR account. Gyms paying Yoyo Gyms.
//
// Sharing one module would mean sharing one secret key, and the first bug
// would be the platform billing a gym through the gym's own account — which
// would take the gym's money and pay it back to the gym.
//
// The other difference, which has bitten this codebase's shape once already:
// the gym helper takes RANDS and multiplies by 100. Everything on the platform
// side is already stored in CENTS (`price_cents`, `amount_cents`). This module
// takes cents and never multiplies.
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

const BASE = process.env.PLATFORM_PAYSTACK_BASE || 'https://api.paystack.co';

/** Read at call time, never at import time, so tests need no env (D-080). */
const secret = () => process.env.PLATFORM_PAYSTACK_SECRET_KEY || '';

export function paystackConfigured() {
  return Boolean(secret());
}

async function call(path, { method = 'GET', body } = {}) {
  const key = secret();
  if (!key) throw new Error('Platform Paystack is not configured (PLATFORM_PAYSTACK_SECRET_KEY).');

  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.status === false) {
    throw new Error(json.message || `Paystack error (${res.status})`);
  }
  return json.data;
}

/**
 * Start a subscription payment the gym owner completes in a browser.
 *
 * @param {number} amountCents  ALREADY in cents. Not rands.
 */
export function initializeSubscriptionPayment({ email, amountCents, reference, callbackUrl, metadata }) {
  assertCents(amountCents);
  return call('/transaction/initialize', {
    method: 'POST',
    body: {
      email,
      amount: amountCents,
      reference,
      callback_url: callbackUrl,
      currency: 'ZAR',
      // `channels` is restricted to card on purpose: a renewal needs a stored
      // authorization, and only a card gives one that can be charged again.
      channels: ['card'],
      metadata: { ...metadata, purpose: 'platform_subscription' },
    },
  });
}

/** Confirm with Paystack what actually happened. Never trust the callback. */
export function verifyTransaction(reference) {
  return call(`/transaction/verify/${encodeURIComponent(reference)}`);
}

/** Charge a card the owner has already authorised — the renewal path. */
export function chargeAuthorization({ email, amountCents, authorizationCode, reference }) {
  assertCents(amountCents);
  return call('/transaction/charge_authorization', {
    method: 'POST',
    body: {
      email,
      amount: amountCents,
      authorization_code: authorizationCode,
      reference,
      currency: 'ZAR',
    },
  });
}

/**
 * Verify a webhook against the RAW body.
 *
 * The raw bytes, not the parsed object: JSON.parse followed by JSON.stringify
 * does not reproduce them (key order, unicode escapes, whitespace), and the
 * signature is over the bytes Paystack sent.
 */
export function verifySignature(rawBody, signature) {
  const key = secret();
  if (!key || !signature || !rawBody) return false;

  const expected = createHmac('sha512', key).update(rawBody).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature)));
  } catch {
    // Different lengths throw rather than return false. A length mismatch is
    // simply an invalid signature.
    return false;
  }
}

/** A reference unique enough that a retry cannot collide with the original. */
export function newReference(prefix = 'YG') {
  return `${prefix}-${Date.now()}-${randomBytes(4).toString('hex').toUpperCase()}`;
}

function assertCents(amountCents) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    // Refused rather than rounded. A non-integer here means someone passed
    // rands, and charging 499 cents instead of 49,900 would be silent.
    throw new Error(`Amount must be a positive whole number of cents, got: ${amountCents}`);
  }
}
