// Payments router — /api/payments/* (initialize, verify, webhook, purchase-pack).
import { json } from '../../server/lib/http.js';
import initialize from '../../server/handlers/payments/initialize.js';
import verify from '../../server/handlers/payments/verify.js';
import webhook from '../../server/handlers/payments/webhook.js';
import purchasePack from '../../server/handlers/payments/purchase-pack.js';

const routes = { initialize, verify, webhook, 'purchase-pack': purchasePack };

export default function handler(req, res) {
  const parts = new URL(req.url, 'http://localhost').pathname.split('/').filter(Boolean);
  const seg = parts[2];
  const fn = routes[seg];
  if (!fn) return json(res, 404, { error: `Not found: /api/payments/${seg || ''}` });
  return fn(req, res);
}
