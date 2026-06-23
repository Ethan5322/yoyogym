// POST /api/payments/webhook — Paystack server-to-server confirmation.
//
// This is the authoritative source of truth for payment success. We:
//  1. validate the signature when the raw body is available, AND
//  2. independently re-verify the transaction via the Paystack API
// before activating — so a forged request cannot activate a membership.
//
// Always responds 200 quickly so Paystack does not retry unnecessarily.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, ok, json } from '../../lib/http.js';
import { paystackConfigured, verifyTransaction, verifySignature } from '../../lib/paystack.js';
import { activatePayment } from '../../lib/activation.js';

// Read the raw request body so we can validate the HMAC signature.
async function readRaw(req) {
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  return await new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
    req.on('error', () => resolve(''));
  });
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  if (!paystackConfigured()) return json(res, 200, { received: true });

  try {
    const raw = await readRaw(req);
    let event;
    try {
      event = raw ? JSON.parse(raw) : req.body || {};
    } catch {
      event = req.body || {};
    }

    const signature = req.headers['x-paystack-signature'];
    const signatureOk = raw ? verifySignature(raw, signature) : false;

    const reference = event?.data?.reference;
    if (!reference) return json(res, 200, { received: true });

    // Independently re-verify with Paystack (authoritative even if signature
    // could not be checked because the raw body was already parsed upstream).
    const data = await verifyTransaction(reference).catch(() => null);
    if (!data || data.status !== 'success') return json(res, 200, { received: true });

    // If we could check the signature and it failed, refuse to act.
    if (raw && signature && !signatureOk) return json(res, 200, { received: true, ignored: 'bad_signature' });

    const supabase = getSupabase();
    const { data: payment } = await supabase
      .from('payments')
      .select('*')
      .eq('paystack_reference', reference)
      .maybeSingle();
    if (payment) await activatePayment(supabase, payment, data);

    return ok(res, { received: true });
  } catch (err) {
    console.error('webhook error:', err.message);
    // Still 200 — we logged it; Paystack retries are not helpful for our errors.
    return json(res, 200, { received: true });
  }
}
