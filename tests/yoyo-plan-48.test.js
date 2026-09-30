// CLAUDE.md §48: the owner's monthly fee and Pay now — on the gym's dashboard
// and the Yoyo account page; the free trial from the day the gym opened; the
// store app shows the status only; paying during the trial pays for the month
// AFTER it, so nothing is charged twice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.JWT_SECRET ||= 'test-only-gym-secret';
process.env.PLATFORM_JWT_SECRET ||= 'test-only-signing-key-not-used-anywhere';
process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-only-service-key';

const { planStanding, planWords, monthBought, planDate, planRange, planFee } = await import('../shared/yoyo-plan.js');
const { signPayTicket, readPayTicket, payTicketKey } = await import('../shared/pay-ticket.js');
const { startCheckout, completeCheckout } = await import('../platform/checkout.js');
const { eventToIntent } = await import('../platform/billing.js');
const { platformOpsDeps } = await import('../platform/deps.js');
const { handlePlatform } = await import('../platform/router.js');
const { ownerDashboardPage, paymentResultPage } = await import('../platform/views.js');
const { fakeDb } = await import('./fake-db.js');
const { runWithGym } = await import('../server/lib/tenancy.js');
const { signToken } = await import('../server/lib/auth.js');
const { ALL_SERVICES, ROUTE_FEATURES, FEATURES } = await import('../shared/features.js');
const { default: yoyoPlan } = await import('../server/handlers/admin/yoyo-plan.js');

const NOW = new Date('2026-09-30T10:00:00Z');
const DAY = 86_400_000;
const APP_UA = 'Mozilla/5.0 (Linux; Android 14) Chrome/128 Mobile YoyoGymsApp';

// COCATE GYM as it is today: built 29 Sep, 30 free days, nothing paid.
const TRIAL = {
  id: 's1', gym_id: 'g1', plan_id: 'p-medium', status: 'trialing',
  created_at: '2026-09-29T09:49:40Z',
  trial_ends_at: '2026-10-29T09:49:39Z',
  current_period_start: '2026-09-29T09:49:39Z',
  current_period_end: '2026-10-29T09:49:39Z',
};
const MEDIUM = { id: 'p-medium', key: 'medium', label: 'Medium', price_cents: 99900, currency: 'ZAR' };
// KOM: its own gym, covered for a hundred years (2026-09-23-kom-first-tenant.sql).
const KOM = { status: 'active', created_at: '2026-09-23T08:48:50Z', trial_ends_at: null, current_period_start: '2026-09-23T08:48:50Z', current_period_end: '2126-09-23T08:48:50Z' };

// ---------------------------------------------------------------------------
// Where a gym stands
// ---------------------------------------------------------------------------

test('the free trial runs from the day the gym opened, and says Pay now', () => {
  const s = planStanding(TRIAL, NOW);
  assert.equal(s.state, 'trial');
  assert.equal(s.canPay, true);
  const w = planWords(s);
  assert.equal(w.status, 'Free trial: 29 Sep – 29 Oct 2026');
  assert.equal(w.button, 'Pay now');
  assert.match(w.note, /Nothing to pay until 29 Oct 2026\. Pay now and your first paid month runs 29 Oct – 28 Nov 2026 — you keep every free day\./);
});

test('paying during the trial buys the month AFTER it (§48.1 Q3); a late payment starts today', () => {
  assert.deepEqual(monthBought(TRIAL.trial_ends_at, NOW), { start: '2026-10-29T09:49:39.000Z', end: '2026-11-28T09:49:39.000Z' });
  assert.deepEqual(monthBought('2026-09-01T00:00:00Z', NOW), { start: NOW.toISOString(), end: new Date(NOW.getTime() + 30 * DAY).toISOString() });
  assert.deepEqual(monthBought(null, NOW).start, NOW.toISOString());
});

test('paid during the trial: the free days still show, then the paid month — and no second payment yet', () => {
  const paid = { ...TRIAL, status: 'active', current_period_start: '2026-10-29T09:49:39Z', current_period_end: '2026-11-28T09:49:39Z' };
  const s = planStanding(paid, NOW);
  assert.equal(s.state, 'trial_paid');
  assert.equal(s.canPay, false, 'the next month is not open for payment yet');
  assert.equal(planWords({ ...s, paidFrom: paid.current_period_start }).status, 'Free trial: 29 Sep – 29 Oct 2026 · paid 29 Oct – 28 Nov 2026');
});

test('an active gym pays the next month only once the current one is under way', () => {
  const active = { ...TRIAL, status: 'active', trial_ends_at: '2026-08-01T00:00:00Z', current_period_end: '2026-10-20T00:00:00Z' };
  const s = planStanding(active, NOW);
  assert.equal(s.state, 'active');
  assert.equal(s.canPay, true);
  assert.equal(planWords(s).button, 'Pay monthly fee now');
  assert.equal(planWords(s).status, 'Active — paid until 20 Oct 2026');
  assert.match(planWords(s).note, /Paying now covers 20 Oct – 19 Nov 2026/);

  const ahead = planStanding({ ...active, current_period_end: '2026-12-20T00:00:00Z' }, NOW);
  assert.equal(ahead.canPay, false);
  assert.match(planWords(ahead).note, /The next month can be paid from 19 Nov 2026/);
});

test('KOM, covered for a century, is never offered a payment or a date to pay from', () => {
  const s = planStanding(KOM, NOW);
  assert.equal(s.state, 'active');
  assert.equal(s.canPay, false);
  assert.equal(planWords(s).status, 'Active — paid until 23 Sep 2126');
  assert.equal(planWords(s).note, '');
});

test('late, suspended, over and ended each say what is true — and which can be paid', () => {
  const over = planStanding(TRIAL, new Date('2026-11-01T00:00:00Z'));
  assert.equal(over.state, 'trial_ended');
  assert.equal(planWords(over).status, 'Your free trial ended on 29 Oct 2026');
  assert.equal(planWords(over).urgent, true);

  const due = planStanding({ ...TRIAL, status: 'past_due', grace_ends_at: '2026-10-02T00:00:00Z' }, NOW);
  assert.equal(planWords(due).status, 'Payment due — your gym stays open until 2 Oct 2026');
  assert.equal(due.canPay, true);

  const closed = planStanding({ ...TRIAL, status: 'suspended' }, NOW);
  assert.equal(planWords(closed).button, 'Pay and reopen my gym');
  assert.equal(planWords(closed).tone, 'bad');

  assert.equal(planStanding({ ...TRIAL, status: 'cancelled' }, NOW).canPay, false);
  assert.equal(planStanding(null, NOW).canPay, false);
});

test('inside the store app, or with no price set, nothing offers a payment', () => {
  const s = planStanding(TRIAL, NOW);
  assert.equal(planWords(s, { inApp: true }).note, '');
  assert.equal(planWords(s, { inApp: true }).status, 'Free trial: 29 Sep – 29 Oct 2026', 'the status still shows');
  assert.equal(planWords(s, { priced: false }).note, '');
});

test('dates and fees read the same on every device', () => {
  assert.equal(planDate('2026-09-29T09:49:40Z'), '29 Sep 2026');
  assert.equal(planRange('2026-12-20T00:00:00Z', '2027-01-19T00:00:00Z'), '20 Dec 2026 – 19 Jan 2027');
  assert.equal(planFee(99900, 'ZAR'), 'ZAR 999.00 a month');
  assert.equal(planFee(null), '');
  assert.equal(planFee(0), '');
});

// ---------------------------------------------------------------------------
// Taking the payment
// ---------------------------------------------------------------------------

function checkoutDeps(sub, over = {}) {
  const calls = { invoices: [], activated: [], audits: [] };
  return {
    calls,
    getSubscription: async () => sub,
    getPlan: async () => MEDIUM,
    getGym: async () => ({ id: 'g1', slug: 'cocate-gym', owner_email: 'owner@cocate.co' }),
    findOpenInvoice: async () => null,
    createInvoice: async (row) => { calls.invoices.push(row); return { ...row, id: 'inv1' }; },
    initializePayment: async () => ({ authorization_url: 'https://checkout.paystack.com/abc' }),
    findInvoiceByRef: async () => ({ id: 'inv1', gym_id: 'g1', amount_cents: 99900, provider_ref: 'YG-1', status: 'issued', period_end: TRIAL.trial_ends_at }),
    verifyPayment: async () => ({ status: 'success', amount: 99900, authorization: { authorization_code: 'AUTH_1', brand: 'visa', last4: '4081' } }),
    markInvoicePaid: async () => {},
    activateSubscription: async (gymId, patch) => { calls.activated.push(patch); },
    audit: async (a) => { calls.audits.push(a); },
    ...over,
  };
}

test('a month already paid far ahead is not paid again — refused before any invoice or Paystack page', async () => {
  const d = checkoutDeps({ ...TRIAL, status: 'active', trial_ends_at: null, current_period_end: '2026-12-20T00:00:00Z' });
  const r = await startCheckout(d, { gymId: 'g1', now: NOW });
  assert.equal(r.ok, false);
  assert.match(r.reason, /paid until 20 Dec 2026\. The next month can be paid from 19 Nov 2026\. Nothing has been charged\./);
  assert.equal(d.calls.invoices.length, 0);
});

test('a trial payment is raised against the trial\'s end, and recorded as the month after it', async () => {
  const d = checkoutDeps(TRIAL);
  const r = await startCheckout(d, { gymId: 'g1', now: NOW, source: 'gym admin panel' });
  assert.equal(r.ok, true);
  assert.equal(d.calls.invoices[0].period_end, TRIAL.trial_ends_at);
  assert.equal(d.calls.invoices[0].amount_cents, 99900, 'the plan\'s price');
  assert.equal(d.calls.audits[0].detail.from, 'gym admin panel');

  await completeCheckout(d, { reference: 'YG-1', now: NOW });
  assert.equal(d.calls.activated[0].current_period_start, '2026-10-29T09:49:39.000Z', 'every free day kept');
  assert.equal(d.calls.activated[0].current_period_end, '2026-11-28T09:49:39.000Z');
});

test('the webhook, arriving first, records the same month and the card (it recorded neither)', async () => {
  const intent = eventToIntent({
    event: 'charge.success',
    data: { reference: 'YG-1', amount: 99900, customer: { customer_code: 'CUS_9' }, authorization: { authorization_code: 'AUTH_9', brand: 'visa', last4: '4081' } },
  });
  assert.deepEqual(intent.card, { paystack_auth_code: 'AUTH_9', paystack_customer: 'CUS_9', card_brand: 'visa', card_last4: '4081' });
  assert.equal(eventToIntent({ event: 'charge.success', data: { reference: 'YG-2' } }).card, null);

  const db = fakeDb({
    platform_invoices: [{ id: 'inv1', gym_id: 'g1', provider_ref: 'YG-1', status: 'issued', amount_cents: 99900, period_end: '2099-01-01T00:00:00.000Z' }],
    platform_subscriptions: [{ id: 's1', gym_id: 'g1', status: 'trialing', trial_ends_at: '2099-01-01T00:00:00.000Z', current_period_end: '2099-01-01T00:00:00.000Z' }],
    gyms: [{ id: 'g1', status: 'active' }],
    platform_audit_log: [],
  });
  const r = await platformOpsDeps(db).applyPaystackEvent(intent);
  assert.equal(r.ok, true);
  const sub = db.tables.platform_subscriptions[0];
  assert.equal(sub.status, 'active');
  assert.equal(sub.current_period_start, '2099-01-01T00:00:00.000Z', 'starts where the trial ends');
  assert.equal(sub.current_period_end, '2099-01-31T00:00:00.000Z');
  assert.equal(sub.paystack_auth_code, 'AUTH_9', 'next month can be taken');
  assert.equal(db.tables.platform_invoices[0].status, 'paid');
});

test('Paystack failing, or its key not set, is said plainly — nothing charged, no crash', async () => {
  const d = checkoutDeps(TRIAL, { initializePayment: async () => { throw new Error('Platform Paystack is not configured'); } });
  const r = await startCheckout(d, { gymId: 'g1', now: NOW });
  assert.equal(r.ok, false);
  assert.match(r.reason, /Card payments are not available right now\. Nothing has been charged/);
});

test('Settings names the key the platform actually reads', () => {
  const router = readFileSync('platform/router.js', 'utf8');
  assert.match(router, /name: 'PLATFORM_PAYSTACK_SECRET_KEY',\s*on: paystackConfigured\(\)/);
  assert.match(readFileSync('platform/paystack.js', 'utf8'), /process\.env\.PLATFORM_PAYSTACK_SECRET_KEY/);
});

// ---------------------------------------------------------------------------
// The ticket that carries Pay now from the gym's panel to the platform
// ---------------------------------------------------------------------------

test('a ticket names its gym, lasts five minutes, and cannot be altered or reused with another key', () => {
  const key = payTicketKey();
  const t = signPayTicket({ gymId: 'g1', slug: 'cocate-gym' }, key, NOW.getTime());
  assert.deepEqual(readPayTicket(t, key, NOW.getTime() + 60_000), { gymId: 'g1', slug: 'cocate-gym' });
  assert.equal(readPayTicket(t, key, NOW.getTime() + 5 * 60_000 + 1), null, 'expired');
  assert.equal(readPayTicket(t, 'another-key', NOW.getTime()), null);

  const [body, sig] = t.split('.');
  const forged = Buffer.from(JSON.stringify({ g: 'g2', s: 'other', e: NOW.getTime() + 60_000 })).toString('base64url');
  assert.equal(readPayTicket(`${forged}.${sig}`, key, NOW.getTime()), null, 'another gym');
  assert.equal(readPayTicket(`${body}.${sig}.x`, key, NOW.getTime()), null);
  assert.equal(readPayTicket('', key), null);
  assert.equal(readPayTicket(t, '', NOW.getTime()), null, 'no key, no ticket');
});

// ---------------------------------------------------------------------------
// The gym admin panel's endpoint
// ---------------------------------------------------------------------------

async function callPlan({ method = 'GET', role = 'owner', ua = 'Mozilla/5.0 Chrome/128', billing, gym = { id: 'g1', slug: 'cocate-gym' } } = {}) {
  const res = {
    statusCode: 200, body: '',
    status(c) { this.statusCode = c; return this; },
    setHeader() { return this; },
    end(b) { this.body = b || ''; return this; },
  };
  const token = signToken({ id: 'a1', username: 'owner', role, full_name: 'Owner' });
  const req = { method, url: '/api/admin/yoyo-plan', headers: { authorization: `Bearer ${token}`, 'user-agent': ua } };
  const read = billing ?? (async () => ({ subscription: TRIAL, plan: MEDIUM }));
  await runWithGym({ client: fakeDb({}), features: ALL_SERVICES, gym }, () => yoyoPlan(req, res, { billing: read }));
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
}

test('the plan card is the owner\'s alone', async () => {
  for (const role of ['manager', 'reception', 'trainer']) {
    assert.equal((await callPlan({ role })).status, 403, role);
    assert.equal((await callPlan({ role, method: 'POST' })).status, 403, role);
  }
});

test('in a browser: the plan, its fee, the trial dates, and Pay now', async () => {
  const r = await callPlan();
  assert.equal(r.status, 200);
  assert.equal(r.body.plan.label, 'Medium');
  assert.equal(r.body.plan.price_cents, 99900);
  assert.equal(r.body.standing.state, 'trial');
  assert.equal(r.body.standing.trialStart, TRIAL.created_at);
  assert.equal(r.body.standing.trialEnd, TRIAL.trial_ends_at);
  assert.equal(r.body.standing.canPay, true);
});

test('inside the store app: the status only — no price, no payment, refused by the server too', async () => {
  const r = await callPlan({ ua: APP_UA });
  assert.equal(r.body.inApp, true);
  assert.equal('price_cents' in r.body.plan, false);
  assert.equal(r.body.standing.canPay, false);
  assert.equal(r.body.standing.state, 'trial');
  assert.equal((await callPlan({ method: 'POST', ua: APP_UA })).status, 403);
});

test('an unpriced plan offers no payment', async () => {
  const r = await callPlan({ billing: async () => ({ subscription: TRIAL, plan: { ...MEDIUM, price_cents: null } }) });
  assert.equal(r.body.standing.canPay, false);
});

test('Pay now hands back a ticket for THIS gym, which the platform can read', async () => {
  const r = await callPlan({ method: 'POST' });
  assert.equal(r.status, 200);
  assert.equal(r.body.action, '/platform/pay/start');
  assert.deepEqual(readPayTicket(r.body.ticket, payTicketKey()), { gymId: 'g1', slug: 'cocate-gym' });
});

test('a gym with no Yoyo Gyms plan (single-gym mode) shows no card', async () => {
  const r = await callPlan({ gym: null });
  assert.equal(r.body.plan, null);
});

test('the route is in every plan (a gym must always be able to pay)', () => {
  assert.equal(ROUTE_FEATURES['yoyo-plan'], FEATURES.SETTINGS);
  assert.match(readFileSync('api/admin/[...path].js', 'utf8'), /'yoyo-plan': yoyoPlan/);
});

// ---------------------------------------------------------------------------
// The platform's end of Pay now
// ---------------------------------------------------------------------------

async function postStart(body, ua = 'Mozilla/5.0 Chrome/128', over = {}) {
  const req = { method: 'POST', url: '/platform/pay/start', headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': ua }, _body: body };
  req[Symbol.asyncIterator] = async function* () { yield Buffer.from(req._body); };
  const res = {
    statusCode: 200, headers: {}, body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, getHeader() {},
    writeHead(c, h) { this.statusCode = c; Object.assign(this.headers, Object.fromEntries(Object.entries(h || {}).map(([k, v]) => [k.toLowerCase(), v]))); return this; },
    end(b) { this.body = String(b || ''); return this; },
  };
  const d = checkoutDeps(TRIAL, over);
  await handlePlatform(req, res, d);
  return { res, d };
}

test('a genuine ticket opens Paystack for its gym, at the plan\'s price', async () => {
  const ticket = signPayTicket({ gymId: 'g1', slug: 'cocate-gym' }, payTicketKey());
  const { res, d } = await postStart(`ticket=${encodeURIComponent(ticket)}`);
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.location, 'https://checkout.paystack.com/abc');
  assert.equal(d.calls.invoices[0].gym_id, 'g1');
  assert.equal(d.calls.invoices[0].amount_cents, 99900);
});

test('no ticket, a forged one, or the store app: no payment page', async () => {
  const bad = await postStart('ticket=nonsense');
  assert.equal(bad.res.statusCode, 400);
  assert.match(bad.res.body, /five minutes/);
  assert.equal(bad.d.calls.invoices.length, 0);

  const ticket = signPayTicket({ gymId: 'g1', slug: 'cocate-gym' }, payTicketKey());
  const app = await postStart(`ticket=${encodeURIComponent(ticket)}`, APP_UA);
  assert.equal(app.res.statusCode, 302);
  assert.equal(app.res.headers.location, '/platform/my-gym');
  assert.equal(app.d.calls.invoices.length, 0);
});

test('a refusal says why, charges nothing, and leads back to the gym\'s admin panel', async () => {
  const ticket = signPayTicket({ gymId: 'g1', slug: 'cocate-gym' }, payTicketKey());
  const { res } = await postStart(`ticket=${encodeURIComponent(ticket)}`, undefined, {
    getSubscription: async () => ({ ...TRIAL, status: 'active', trial_ends_at: null, current_period_end: '2027-06-01T00:00:00Z' }),
  });
  assert.equal(res.statusCode, 400);
  assert.match(res.body, /Nothing has been charged/);
  assert.match(res.body, /href="\/g\/cocate-gym\/admin"/);
});

// ---------------------------------------------------------------------------
// The owner's Yoyo account page, and the dashboard
// ---------------------------------------------------------------------------

const GYM = { id: 'g1', slug: 'cocate-gym', search_name: 'COCATE GYM', status: 'active', plan_key: 'medium' };

test('the account page shows the plan, the monthly fee, the trial dates and Pay now', () => {
  const page = ownerDashboardPage({ gym: GYM, subscription: TRIAL, plan: MEDIUM, csrfToken: 't', now: NOW });
  assert.match(page, /Your Yoyo Gyms plan/);
  assert.match(page, /<dt>Monthly fee<\/dt><dd>ZAR 999\.00 a month<\/dd>/);
  assert.match(page, /Free trial: 29 Sep – 29 Oct 2026/);
  assert.match(page, /action="\/platform\/my-gym\/pay"[\s\S]*>Pay now<\/button>/);
});

test('in the store app the account page shows the status only', () => {
  const page = ownerDashboardPage({ gym: GYM, subscription: TRIAL, plan: MEDIUM, csrfToken: 't', inApp: true, now: NOW });
  assert.match(page, /Free trial: 29 Sep – 29 Oct 2026/);
  assert.doesNotMatch(page, /Monthly fee|999|my-gym\/pay|Pay now/);
});

test('KOM\'s account page offers no payment', () => {
  const page = ownerDashboardPage({ gym: { ...GYM, slug: 'kom' }, subscription: KOM, plan: { ...MEDIUM, label: 'Prime' }, csrfToken: 't', now: NOW });
  assert.match(page, /Active — paid until 23 Sep 2126/);
  assert.doesNotMatch(page, /my-gym\/pay/);
});

test('after paying, the owner can go straight back to their gym\'s admin panel', () => {
  assert.match(paymentResultPage({ ok: true, recurring: true, gymSlug: 'cocate-gym' }), /href="\/g\/cocate-gym\/admin\/login">Open your gym admin panel/);
  assert.match(paymentResultPage({ ok: true }), /href="\/platform\/my-gym">Back to your gym/);
});

test('the dashboard shows the plan card to the owner only, and it posts the ticket in a form', () => {
  assert.match(readFileSync('src/pages/admin/Dashboard.jsx', 'utf8'), /user\?\.role === 'owner' && <YoyoPlanCard \/>/);
  const card = readFileSync('src/components/YoyoPlanCard.jsx', 'utf8');
  assert.match(card, /form\.method = 'post'/);
  assert.match(card, /input\.name = 'ticket'/);
  assert.match(card, /const canPay = !inApp && data\.standing\.canPay && Boolean\(fee\)/);
});
