// The registry, the webhook and the cron.
//
// Three routes that each have a different idea of who is allowed to call them:
// a signed-in human with the right permission, Paystack with a valid
// signature, and Vercel with a shared secret. Most of these tests are about
// what happens when the caller is none of those.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

process.env.PLATFORM_JWT_SECRET ||= 'test-only-signing-key-not-used-anywhere';
process.env.PLATFORM_PAYSTACK_SECRET_KEY = 'sk_test_not_a_real_key';
process.env.PLATFORM_CRON_SECRET = 'cron-secret-for-tests';

import { handlePlatform } from '../platform/router.js';
import { sessionCookie, issueCsrfToken } from '../platform/http.js';

const USER = { id: 'staff-1', email: 'owner@yoyogyms.com', kind: 'platform_staff' };
const session = () => sessionCookie(USER).split(';')[0];

function req({ method = 'GET', url = '/platform/registry', cookie = '', body = '', headers = {} } = {}) {
  const r = {
    method,
    url,
    headers: {
      ...(cookie ? { cookie } : {}),
      'content-type': 'application/x-www-form-urlencoded',
      ...headers,
    },
    _body: body,
  };
  r[Symbol.asyncIterator] = async function* () {
    if (r._body) yield Buffer.from(r._body);
  };
  return r;
}

function res() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    getHeader(k) { return this.headers[k.toLowerCase()]; },
    writeHead(code, h) {
      this.statusCode = code;
      for (const [k, v] of Object.entries(h || {})) this.headers[k.toLowerCase()] = v;
      return this;
    },
    end(b) { this.body = b || ''; this.ended = true; return this; },
  };
}

const GYM = { id: 'gym-1', slug: 'bos-gym', search_name: 'BOS GYM', city: 'Cape Town', status: 'active', plan_key: 'basic' };

function deps({ permissions = ['gym.view', 'gym.suspend'] } = {}) {
  const calls = { status: [], audits: [], webhooks: [], billing: [] };
  return {
    calls,
    audit: async (a) => { calls.audits.push(a); },
    permissionsFor: async () => permissions,
    listGyms: async () => [GYM],
    getGymDetail: async () => ({ gym: GYM, subscription: null, invoices: [] }),
    setGymStatus: async (id, status, reason) => { calls.status.push({ id, status, reason }); },
    applyPaystackEvent: async (intent) => { calls.webhooks.push(intent); return { ok: true }; },
    runBilling: async (opts) => { calls.billing.push(opts); return { checked: 1, charged: 0, dryRun: opts.dryRun }; },
    reconcile: async () => ({ ok: false, checkedSchemas: 3, orphans: [{ schema_name: 'gym_ghost', risk: 'Personal data with no owner.', likely_cause: 'failed provision', next_step: 'Look first.' }], dangling: [] }),
  };
}

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

test('the gym finder is public and needs no session', async () => {
  const r = res();
  await handlePlatform(req({ url: '/platform/find' }), r, deps());

  assert.equal(r.statusCode, 200);
  assert.match(r.body, /Find your gym/);
  assert.match(r.body, /index,follow/, 'a page members must be able to find');
});

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

test('the registry requires a session', async () => {
  const r = res();
  await handlePlatform(req({ url: '/platform/registry' }), r, deps());

  assert.equal(r.statusCode, 302);
  assert.equal(r.headers.location, '/platform/login');
});

test('a signed-in user without gym.view is refused, not shown an empty list', async () => {
  // An empty list would read as "there are no gyms", which is a lie.
  const r = res();
  await handlePlatform(req({ url: '/platform/registry', cookie: session() }), r, deps({ permissions: [] }));

  assert.equal(r.statusCode, 403);
});

test('with gym.view the registry lists gyms, and no schema name appears', async () => {
  const r = res();
  await handlePlatform(req({ url: '/platform/registry', cookie: session() }), r, deps({ permissions: ['gym.view'] }));

  assert.equal(r.statusCode, 200);
  assert.match(r.body, /BOS GYM/);
  assert.ok(!/schema/i.test(r.body), 'the isolation boundary is never rendered');
});

test('a reviewer who may look cannot suspend', async () => {
  const d = deps({ permissions: ['gym.view'] });
  const r = res();

  await handlePlatform(
    req({
      method: 'POST',
      url: '/platform/registry/gym-1/suspend',
      cookie: session(),
      body: `reason=late&csrf=${encodeURIComponent(issueCsrfToken('staff-1'))}`,
    }),
    r,
    d
  );

  assert.equal(r.statusCode, 403);
  assert.equal(d.calls.status.length, 0, 'nothing may change');
});

test('suspending needs a CSRF token as well as the permission', async () => {
  const d = deps();
  const r = res();

  await handlePlatform(
    req({ method: 'POST', url: '/platform/registry/gym-1/suspend', cookie: session(), body: 'reason=late' }),
    r,
    d
  );

  assert.equal(r.statusCode, 403);
  assert.equal(d.calls.status.length, 0);
});

test('with the permission and a token, a gym is suspended and the reason is recorded', async () => {
  const d = deps();
  const r = res();

  await handlePlatform(
    req({
      method: 'POST',
      url: '/platform/registry/gym-1/suspend',
      cookie: session(),
      body: `reason=unpaid+since+March&csrf=${encodeURIComponent(issueCsrfToken('staff-1'))}`,
    }),
    r,
    d
  );

  assert.deepEqual(d.calls.status[0], { id: 'gym-1', status: 'suspended', reason: 'unpaid since March' });
  assert.ok(d.calls.audits.some((a) => a.action === 'platform.gym.suspended'));
  assert.equal(r.statusCode, 302, 'redirect after post');
});

test('reactivating is its own route and is also audited', async () => {
  const d = deps();
  const r = res();

  await handlePlatform(
    req({
      method: 'POST',
      url: '/platform/registry/gym-1/reactivate',
      cookie: session(),
      body: `csrf=${encodeURIComponent(issueCsrfToken('staff-1'))}`,
    }),
    r,
    d
  );

  assert.equal(d.calls.status[0].status, 'active');
  assert.ok(d.calls.audits.some((a) => a.action === 'platform.gym.reactivated'));
});

// ---------------------------------------------------------------------------
// The webhook
// ---------------------------------------------------------------------------

const sign = (body) =>
  createHmac('sha512', process.env.PLATFORM_PAYSTACK_SECRET_KEY).update(body).digest('hex');

test('an unsigned webhook is rejected and changes nothing', async () => {
  const d = deps();
  const r = res();
  const body = JSON.stringify({ event: 'charge.success', data: { reference: 'YG-1' } });

  await handlePlatform(req({ method: 'POST', url: '/platform/webhooks/paystack', body }), r, d);

  assert.equal(r.statusCode, 401);
  assert.equal(d.calls.webhooks.length, 0);
});

test('a webhook signed with the wrong key is rejected', async () => {
  const d = deps();
  const r = res();
  const body = JSON.stringify({ event: 'charge.success', data: { reference: 'YG-1' } });
  const forged = createHmac('sha512', 'the-wrong-key').update(body).digest('hex');

  await handlePlatform(
    req({ method: 'POST', url: '/platform/webhooks/paystack', body, headers: { 'x-paystack-signature': forged } }),
    r,
    d
  );

  assert.equal(r.statusCode, 401);
  assert.equal(d.calls.webhooks.length, 0);
});

test('a correctly signed webhook is applied', async () => {
  const d = deps();
  const r = res();
  const body = JSON.stringify({ event: 'charge.success', data: { reference: 'YG-1', amount: 49900 } });

  await handlePlatform(
    req({ method: 'POST', url: '/platform/webhooks/paystack', body, headers: { 'x-paystack-signature': sign(body) } }),
    r,
    d
  );

  assert.equal(r.statusCode, 200);
  assert.equal(d.calls.webhooks[0].kind, 'payment_succeeded');
  assert.equal(d.calls.webhooks[0].reference, 'YG-1');
});

test('a signed but unrecognised event is acknowledged and ignored', async () => {
  // Paystack retries anything that is not 200, forever. An event we do not
  // handle is not an error — it is an event we do not handle.
  const d = deps();
  const r = res();
  const body = JSON.stringify({ event: 'customer.wombat', data: { reference: 'YG-1' } });

  await handlePlatform(
    req({ method: 'POST', url: '/platform/webhooks/paystack', body, headers: { 'x-paystack-signature': sign(body) } }),
    r,
    d
  );

  assert.equal(r.statusCode, 200);
  assert.equal(d.calls.webhooks.length, 0);
});

// ---------------------------------------------------------------------------
// The cron
// ---------------------------------------------------------------------------

test('the cron refuses a caller with no secret', async () => {
  const d = deps();
  const r = res();
  await handlePlatform(req({ method: 'POST', url: '/platform/cron' }), r, d);

  assert.equal(r.statusCode, 401);
  assert.equal(d.calls.billing.length, 0);
});

test('the cron runs with the shared secret, and is a DRY RUN unless told otherwise', async () => {
  const d = deps();
  const r = res();

  await handlePlatform(
    req({ method: 'POST', url: '/platform/cron', headers: { authorization: 'Bearer cron-secret-for-tests' } }),
    r,
    d
  );

  assert.equal(r.statusCode, 200);
  assert.equal(d.calls.billing[0].dryRun, true, 'money never moves by default');
});

// ---------------------------------------------------------------------------
// The drift report
// ---------------------------------------------------------------------------

test('the drift report needs a session and a permission', async () => {
  const r = res();
  await handlePlatform(req({ url: '/platform/reconcile', cookie: session() }), r, deps({ permissions: [] }));
  assert.equal(r.statusCode, 403);
});

test('the drift report renders its findings in words a person can act on', async () => {
  const r = res();
  await handlePlatform(req({ url: '/platform/reconcile', cookie: session() }), r, deps({ permissions: ['gym.view'] }));

  assert.equal(r.statusCode, 200);
  assert.match(r.body, /gym_ghost/);
  assert.match(r.body, /never changes anything/i, 'the page states plainly that it is read-only');
});

test('a drift report that blows up still renders, rather than 500ing the panel', async () => {
  const d = { ...deps({ permissions: ['gym.view'] }), reconcile: async () => { throw new Error('Management API down'); } };
  const r = res();
  await handlePlatform(req({ url: '/platform/reconcile', cookie: session() }), r, d);

  assert.equal(r.statusCode, 200);
});

test('the cron still returns its billing result when the drift report fails', async () => {
  // Billing has already moved money by that point. Losing the report of what
  // it did, because a read-only check failed afterwards, would be the worst
  // possible ordering of those two facts.
  const d = { ...deps(), reconcile: async () => { throw new Error('nope'); } };
  const r = res();

  await handlePlatform(
    req({ method: 'POST', url: '/platform/cron', headers: { authorization: 'Bearer cron-secret-for-tests' } }),
    r,
    d
  );

  assert.equal(r.statusCode, 200);
  const body = JSON.parse(r.body);
  assert.equal(body.checked, 1, 'the billing result survived');
  assert.equal(body.drift.ok, false);
});

// ---------------------------------------------------------------------------
// Owner activation, through the router
// ---------------------------------------------------------------------------

import { issueActivation } from '../platform/activation.js';

function activationDeps() {
  const issued = issueActivation({ userId: 'u1', gymId: 'gym-1', now: new Date() });
  const calls = { passwords: [], used: [], gyms: [], audits: [] };
  return {
    issued,
    calls,
    activationContext: async () => ({ gymName: 'BOS GYM' }),
    findActivation: async () => ({ ...issued.row, id: 'act-1' }),
    setPassword: async (userId, hash) => { calls.passwords.push({ userId, hash }); },
    markUsed: async (id) => { calls.used.push(id); },
    setGymStatus: async (gymId, status) => { calls.gyms.push({ gymId, status }); },
    audit: async (a) => { calls.audits.push(a); },
  };
}

test('the activation form is public and names the gym', async () => {
  const r = res();
  await handlePlatform(req({ url: '/platform/activate?token=abc' }), r, activationDeps());

  assert.equal(r.statusCode, 200);
  assert.match(r.body, /BOS GYM/);
  assert.match(r.body, /name="code"/);
  assert.match(r.body, /value="abc"/, 'the token is carried through the form');
});

test('activating with the right code sets the password', async () => {
  const d = activationDeps();
  const r = res();

  await handlePlatform(
    req({
      method: 'POST',
      url: '/platform/activate',
      body: `token=${d.issued.token}&code=${d.issued.code}&password=a-long-enough-password`,
    }),
    r,
    d
  );

  assert.equal(r.statusCode, 200);
  assert.equal(d.calls.passwords.length, 1);
  assert.match(r.body, /account is active/i);
});

test('a wrong code re-renders the form and keeps the token', async () => {
  const d = activationDeps();
  const r = res();

  await handlePlatform(
    req({
      method: 'POST',
      url: '/platform/activate',
      body: `token=${d.issued.token}&code=000000&password=a-long-enough-password`,
    }),
    r,
    d
  );

  assert.equal(r.statusCode, 400);
  assert.equal(d.calls.passwords.length, 0);
  assert.match(r.body, new RegExp(d.issued.token), 'no need to dig the email out again');
});

test('the raw code never appears in the page after a failure', async () => {
  // Re-rendering the submitted code would put it in the browser history and
  // in any screenshot of the error.
  const d = activationDeps();
  const r = res();

  await handlePlatform(
    req({
      method: 'POST',
      url: '/platform/activate',
      body: `token=${d.issued.token}&code=${d.issued.code}&password=short`,
    }),
    r,
    d
  );

  assert.ok(!r.body.includes(`value="${d.issued.code}"`));
});

// ---------------------------------------------------------------------------
// Per-gym counts (D-130) — counts only, never names
// ---------------------------------------------------------------------------

test('the gym page shows counts, and says they are only counts', async () => {
  const d = {
    ...deps({ permissions: ['gym.view'] }),
    gymStatsFor: async () => ({
      activeMembers: 87, checkinsThisMonth: 412,
      lastActivityAt: '2026-09-21T18:00:00Z', reachable: true,
    }),
  };
  const r = res();

  await handlePlatform(req({ url: '/platform/registry/gym-1', cookie: session() }), r, d);

  assert.match(r.body, /87/, 'the count is shown');
  assert.match(r.body, /Counts only/i, 'and the page says what it is');
  assert.match(r.body, /never reads a member's name/i);
});

test('an unreachable gym says so rather than showing zero', async () => {
  // Zero members and "we could not reach this gym" are completely different
  // facts, and only one of them is true.
  const d = {
    ...deps({ permissions: ['gym.view'] }),
    gymStatsFor: async () => ({ activeMembers: null, checkinsThisMonth: null, lastActivityAt: null, reachable: false }),
  };
  const r = res();

  await handlePlatform(req({ url: '/platform/registry/gym-1', cookie: session() }), r, d);

  assert.match(r.body, /could not be reached/i);
  assert.ok(!/<b>0<\/b>/.test(r.body), 'never presented as zero members');
});

test('stats failing does not hide the whole gym', async () => {
  const d = {
    ...deps({ permissions: ['gym.view'] }),
    gymStatsFor: async () => { throw new Error('schema gone'); },
  };
  const r = res();

  await handlePlatform(req({ url: '/platform/registry/gym-1', cookie: session() }), r, d);

  assert.equal(r.statusCode, 200);
  assert.match(r.body, /BOS GYM/);
});

