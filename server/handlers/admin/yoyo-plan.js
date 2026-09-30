// GET  /api/admin/yoyo-plan -> the gym's own Yoyo Gyms plan, for its owner
// POST /api/admin/yoyo-plan -> a five-minute ticket that opens the payment
//
// The plan card at the top of the owner's dashboard (CLAUDE.md §48): the plan,
// its monthly fee, the free trial's dates or the date it is paid until, and
// Pay now. OWNER ONLY — what the gym pays Yoyo Gyms is the owner's business,
// not the front desk's.
//
// The money itself never passes through here. POST hands the page a ticket
// (shared/pay-ticket.js) naming THIS gym — resolved by the server, never sent
// by the page — which the page posts to /platform/pay/start; the platform
// raises the invoice at the plan's price and opens Paystack.
//
// Inside the store app: the plan and where it stands only — no price, and no
// payment at all (§48.1 Q2, §46.1 Q4). Enforced here, not only by hiding.
import { allowMethods, ok, json, failed } from '../../lib/http.js';
import { requireRole } from '../../lib/auth.js';
import { currentGym } from '../../lib/tenancy.js';
import { isStoreApp } from '../../../shared/store-app.js';
import { planStanding } from '../../../shared/yoyo-plan.js';
import { signPayTicket, payTicketKey } from '../../../shared/pay-ticket.js';

export default async function yoyoPlan(req, res, { billing } = {}) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;
  if (!requireRole(req, res, ['owner'])) return;

  const inApp = isStoreApp(req.headers['user-agent']);
  const gym = currentGym()?.gym;
  // A single-gym deployment has no Yoyo Gyms plan to show or pay.
  if (!gym?.id) return ok(res, { plan: null, inApp });

  if (req.method === 'POST') {
    if (inApp) return json(res, 403, { error: 'Payments are not taken in the app.' });
    const key = payTicketKey();
    if (!key) return json(res, 503, { error: 'Payments are not available right now. Please try again later.' });
    return ok(res, { action: '/platform/pay/start', ticket: signPayTicket({ gymId: gym.id, slug: gym.slug }, key) });
  }

  try {
    const read = billing ?? (await import('../../lib/tenancy-deps.js')).tenancyDeps().gymBilling;
    const { subscription, plan } = await read(gym.id);
    if (!subscription) return ok(res, { plan: null, inApp });
    const standing = planStanding(subscription);
    return ok(res, {
      inApp,
      plan: {
        label: plan?.label || null,
        // No price inside the store app (§48.1 Q2).
        ...(inApp ? {} : { price_cents: plan?.price_cents ?? null, currency: plan?.currency || 'ZAR' }),
      },
      standing: {
        state: standing.state,
        trialStart: standing.trialStart,
        trialEnd: standing.trialEnd,
        paidFrom: subscription.current_period_start ?? null,
        paidUntil: standing.paidUntil,
        graceEnds: standing.graceEnds,
        payableFrom: standing.payableFrom ?? null,
        next: standing.next,
        canPay: !inApp && standing.canPay && Number.isInteger(plan?.price_cents) && plan.price_cents > 0,
      },
      ...(inApp || !subscription.card_last4 ? {} : { card: { brand: subscription.card_brand || 'card', last4: subscription.card_last4 } }),
    });
  } catch (err) {
    return failed(res, err, 'Your Yoyo Gyms plan could not be loaded. Please try again.');
  }
}
