// Payments router — /api/payments/* (initialize, verify, webhook, purchase-pack).
import { json } from '../_lib/http.js';
import initialize from '../_handlers/payments/initialize.js';
import verify from '../_handlers/payments/verify.js';
import webhook from '../_handlers/payments/webhook.js';
import purchasePack from '../_handlers/payments/purchase-pack.js';

const routes = {
  initialize,
  verify,
  webhook,
  'purchase-pack': purchasePack,
};

export default function handler(req, res) {
  const seg = (req.query?.path || [])[0];
  const fn = routes[seg];
  if (!fn) return json(res, 404, { error: `Not found: /api/payments/${seg || ''}` });
  return fn(req, res);
}
