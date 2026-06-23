// Paystack API helper (server-only). Reads PAYSTACK_SECRET_KEY from env.
// Used to initialize transactions, verify them, and validate webhook
// signatures. Currency is ZAR; Paystack expects amounts in kobo (cents).
import crypto from 'node:crypto';

const BASE = 'https://api.paystack.co';
const SECRET = process.env.PAYSTACK_SECRET_KEY;

export function paystackConfigured() {
  return !!SECRET;
}

export function toKobo(zar) {
  return Math.round(Number(zar || 0) * 100);
}

async function call(path, { method = 'GET', body } = {}) {
  if (!SECRET) throw new Error('Paystack is not configured (missing PAYSTACK_SECRET_KEY).');
  const res = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${SECRET}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.status === false) {
    throw new Error(json.message || `Paystack error (${res.status})`);
  }
  return json.data;
}

export function initializeTransaction({ email, amount, reference, callback_url, metadata }) {
  return call('/transaction/initialize', {
    method: 'POST',
    body: { email, amount: toKobo(amount), reference, callback_url, metadata, currency: 'ZAR' },
  });
}

export function verifyTransaction(reference) {
  return call(`/transaction/verify/${encodeURIComponent(reference)}`);
}

/** Charge a stored authorization (recurring billing — own-cron approach). */
export function chargeAuthorization({ email, amount, authorization_code, reference }) {
  return call('/transaction/charge_authorization', {
    method: 'POST',
    body: { email, amount: toKobo(amount), authorization_code, reference, currency: 'ZAR' },
  });
}

/** Validate a webhook signature against the raw request body. */
export function verifySignature(rawBody, signature) {
  if (!SECRET || !signature || !rawBody) return false;
  const hash = crypto.createHmac('sha512', SECRET).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
  } catch {
    return false;
  }
}

/** Generate a unique transaction reference. */
export function newReference(prefix = 'PSK') {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}
