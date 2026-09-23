// Platform router tests, written before the router.
//
// This is the first time the platform's pieces are reachable by a request:
// auth, CSRF, views and the application flow behind one entry point. The tests
// are mostly about the paths that must NOT work.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.PLATFORM_JWT_SECRET ||= 'test-only-signing-key-not-used-anywhere';

import { handlePlatform } from '../platform/router.js';
import { sessionCookie, issueCsrfToken } from '../platform/http.js';

const USER = { id: 'staff-1', email: 'owner@yoyogyms.com', kind: 'platform_staff' };

function req({ method = 'GET', url = '/platform/applications', cookie = '', body = '' } = {}) {
  const r = {
    method,
    url,
    headers: { ...(cookie ? { cookie } : {}), 'content-type': 'application/x-www-form-urlencoded' },
    _body: body,
  };
  // Minimal async-iterable request body, as Node delivers it.
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

const session = () => sessionCookie(USER).split(';')[0];

/** A platform stub: no database, no network. */
function deps({ user = null, applications = [], application = null } = {}) {
  const decisions = [];
  return {
    decisions,
    permissionsFor: async () => ['application.view', 'application.approve', 'application.reject'],
    findUserByEmail: async () => user,
    verifyPassword: async (plain) => plain === 'correct-horse',
    verifySecondFactor: async (_u, code) => code === '123456',
    listApplications: async () => applications,
    getApplicationView: async () => application,
    decide: async (id, actor, action, reason) => {
      decisions.push({ id, actor: actor.sub, action, reason });
      return { ok: true };
    },
    audit: async () => {},
  };
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

test('an unknown platform path is 404, not a redirect to login', async () => {
  const r = res();
  await handlePlatform(req({ url: '/platform/nope' }), r, deps());
  assert.equal(r.statusCode, 404);
});

test('the login page renders without a session', async () => {
  const r = res();
  await handlePlatform(req({ url: '/platform/login' }), r, deps());

  assert.equal(r.statusCode, 200);
  assert.match(r.body, /Sign in/);
  assert.match(r.body, /name="totp"/, 'the second factor is asked for at sign-in');
});

// ---------------------------------------------------------------------------
// Sign-in
// ---------------------------------------------------------------------------

test('a wrong password gives a generic error and no session', async () => {
  const r = res();
  await handlePlatform(
    req({ method: 'POST', url: '/platform/login', body: 'email=x@y.z&password=wrong&totp=123456' }),
    r,
    deps({ user: { id: 'staff-1', email: 'x@y.z', password_hash: 'h', totp_enabled: true } })
  );

  assert.equal(r.statusCode, 200, 're-renders the form rather than redirecting');
  assert.match(r.body, /Invalid/i);
  assert.ok(!r.getHeader('set-cookie'), 'no session is issued');
});

test('a correct password with a WRONG second factor is still refused', async () => {
  const r = res();
  await handlePlatform(
    req({ method: 'POST', url: '/platform/login', body: 'email=x@y.z&password=correct-horse&totp=000000' }),
    r,
    deps({ user: { id: 'staff-1', email: 'x@y.z', password_hash: 'h', totp_enabled: true } })
  );

  assert.ok(!r.getHeader('set-cookie'), 'the password alone must never be enough');
  assert.match(r.body, /Invalid/i);
});

test('an unknown email is refused without revealing that it is unknown', async () => {
  const r = res();
  await handlePlatform(
    req({ method: 'POST', url: '/platform/login', body: 'email=nobody@y.z&password=correct-horse&totp=123456' }),
    r,
    deps({ user: null })
  );

  assert.match(r.body, /Invalid/i, 'same message as a wrong password');
  assert.ok(!r.getHeader('set-cookie'));
});

test('a correct password and second factor issues a session and redirects', async () => {
  const r = res();
  await handlePlatform(
    req({ method: 'POST', url: '/platform/login', body: 'email=x@y.z&password=correct-horse&totp=123456' }),
    r,
    deps({ user: { id: 'staff-1', email: 'x@y.z', password_hash: 'h', totp_enabled: true } })
  );

  assert.equal(r.statusCode, 302);
  assert.equal(r.headers.location, '/platform/applications');
  assert.match(String(r.getHeader('set-cookie')), /HttpOnly/i);
});

// ---------------------------------------------------------------------------
// The guard
// ---------------------------------------------------------------------------

test('applications require a session', async () => {
  const r = res();
  await handlePlatform(req({ url: '/platform/applications' }), r, deps());

  assert.equal(r.statusCode, 302);
  assert.equal(r.headers.location, '/platform/login');
});

test('with a session, the applications queue renders', async () => {
  const r = res();
  await handlePlatform(
    req({ url: '/platform/applications', cookie: session() }),
    r,
    deps({ applications: [{ id: 'a1', proposed_gym_name: 'Iron Works', status: 'submitted', city: 'Cape Town' }] })
  );

  assert.equal(r.statusCode, 200);
  assert.match(r.body, /Iron Works/);
});

test('signing out clears the cookie', async () => {
  const r = res();
  await handlePlatform(req({ method: 'POST', url: '/platform/logout', cookie: session() }), r, deps());

  assert.match(String(r.getHeader('set-cookie')), /Max-Age=0/i);
  assert.equal(r.statusCode, 302);
});

// ---------------------------------------------------------------------------
// Deciding — the state-changing path
// ---------------------------------------------------------------------------

test('a decision without a CSRF token is refused, even with a valid session', async () => {
  const d = deps({ application: { application: { id: 'a1', status: 'submitted' }, documents: [], events: [] } });
  const r = res();

  await handlePlatform(
    req({ method: 'POST', url: '/platform/applications/a1/decide', cookie: session(), body: 'action=approve' }),
    r,
    d
  );

  assert.equal(r.statusCode, 403);
  assert.equal(d.decisions.length, 0, 'nothing may be decided without CSRF');
});

test('a decision with a valid CSRF token goes through', async () => {
  const d = deps({ application: { application: { id: 'a1', status: 'submitted' }, documents: [], events: [] } });
  const r = res();
  const token = issueCsrfToken('staff-1');

  await handlePlatform(
    req({
      method: 'POST',
      url: '/platform/applications/a1/decide',
      cookie: session(),
      body: `action=approve&reason=&csrf=${encodeURIComponent(token)}`,
    }),
    r,
    d
  );

  assert.equal(d.decisions.length, 1);
  assert.equal(d.decisions[0].action, 'approve');
  assert.equal(d.decisions[0].id, 'a1');
  assert.equal(r.statusCode, 302, 'redirect after post, so a refresh does not decide twice');
});

test('an unsupported decision action is refused rather than guessed', async () => {
  const d = deps({ application: { application: { id: 'a1', status: 'submitted' }, documents: [], events: [] } });
  const r = res();
  const token = issueCsrfToken('staff-1');

  await handlePlatform(
    req({
      method: 'POST',
      url: '/platform/applications/a1/decide',
      cookie: session(),
      body: `action=delete_everything&csrf=${encodeURIComponent(token)}`,
    }),
    r,
    d
  );

  assert.equal(d.decisions.length, 0);
  assert.equal(r.statusCode, 400);
});

// ---------------------------------------------------------------------------
// Public: gym-owner application
// ---------------------------------------------------------------------------

test('the apply page is public and shows all three plans', async () => {
  const r = res();
  await handlePlatform(req({ url: '/platform/apply' }), r, deps());

  assert.equal(r.statusCode, 200, 'no session required — this is the front door');
  for (const label of ['Basic', 'Medium', 'Prime']) assert.match(r.body, new RegExp(label));
  assert.match(r.body, /What your members can do/, 'leads with member benefits, not admin screens');
  assert.match(r.body, /anything your gym needs/i, 'the demand-evidence question is asked');
});

test('an application without a plan is refused', async () => {
  const d = { ...deps(), createApplication: async () => ({ ok: true }) };
  const r = res();
  await handlePlatform(
    req({ method: 'POST', url: '/platform/apply',
          body: 'owner_name=A&email=a@b.co&password=longenough1&gym_name=Bos+Gym' }),
    r, d
  );
  assert.equal(r.statusCode, 400);
  assert.match(r.body, /choose a plan/i);
});

test('a short password is refused before an account is created', async () => {
  let created = false;
  const d = { ...deps(), createApplication: async () => { created = true; return { ok: true }; } };
  const r = res();
  await handlePlatform(
    req({ method: 'POST', url: '/platform/apply',
          body: 'owner_name=A&email=a@b.co&password=short&gym_name=Bos+Gym&plan=basic' }),
    r, d
  );
  assert.equal(created, false);
  assert.match(r.body, /10 characters/);
});

test('a valid application is submitted and confirmed', async () => {
  let received = null;
  const d = { ...deps(), createApplication: async (input) => { received = input; return { ok: true }; } };
  const r = res();
  await handlePlatform(
    req({ method: 'POST', url: '/platform/apply',
          body: 'owner_name=Ann&email=ANN@Bos.co&password=longenough1&gym_name=BOS+GYM&city=Cape+Town&country=za&plan=medium&needs=SMS+reminders' }),
    r, d
  );

  assert.equal(received.email, 'ann@bos.co', 'email is normalised');
  assert.equal(received.country, 'ZA');
  assert.equal(received.plan_key, 'medium');
  assert.equal(received.needs, 'SMS reminders', 'demand evidence is captured');
  assert.match(r.body, /Application received/);
});

test('a rejected application redisplays the form without losing what was typed', async () => {
  const d = { ...deps(), createApplication: async () => ({ ok: false, error: 'A gym with a very similar name is already listed.' }) };
  const r = res();
  await handlePlatform(
    req({ method: 'POST', url: '/platform/apply',
          body: 'owner_name=Ann&email=a@b.co&password=longenough1&gym_name=BOS+GYM&plan=basic' }),
    r, d
  );

  assert.match(r.body, /already listed/);
  assert.match(r.body, /value="BOS GYM"/, 'the gym name survives the round trip');
});

// ---------------------------------------------------------------------------
// Public: gym search
// ---------------------------------------------------------------------------

test('gym search is public and returns only what a stranger may know', async () => {
  const d = {
    ...deps(),
    searchGyms: async ({ query }) => {
      assert.equal(query, 'BOS');
      return [{ slug: 'bos-gym', name: 'BOS GYM', city: 'Cape Town', country: 'ZA', distance_km: 2.4 }];
    },
  };
  const r = res();
  await handlePlatform(req({ url: '/platform/gyms?q=BOS' }), r, d);

  assert.equal(r.statusCode, 200);
  const body = JSON.parse(r.body);
  assert.equal(body.gyms[0].slug, 'bos-gym');
  // The schema name is the isolation boundary; it must never be published.
  assert.ok(!r.body.includes('schema'), 'no schema name ever reaches a client');
  assert.ok(!r.body.includes('gym_bos'), 'nor anything resembling one');
});

test('gym search passes coordinates through when the app supplies them', async () => {
  let got = null;
  const d = { ...deps(), searchGyms: async (args) => { got = args; return []; } };
  const r = res();
  await handlePlatform(req({ url: '/platform/gyms?q=&lat=-33.92&lng=18.42' }), r, d);

  assert.equal(got.lat, -33.92);
  assert.equal(got.lng, 18.42);
});

test('bad coordinates are dropped rather than passed on as NaN', async () => {
  let got = null;
  const d = { ...deps(), searchGyms: async (args) => { got = args; return []; } };
  const r = res();
  await handlePlatform(req({ url: '/platform/gyms?lat=abc&lng=' }), r, d);

  assert.equal(got.lat, null);
  assert.equal(got.lng, null);
});

// ---------------------------------------------------------------------------
// A session is not a permission
// ---------------------------------------------------------------------------

test('A GYM OWNER WITH A VALID SESSION CANNOT READ THE APPLICATION QUEUE', async () => {
  // Gym owners hold platform sessions — the signup form creates their account.
  // This page lists every gym that has applied, with its city, its plan and the
  // free-text answer about what that business needs. Signing up as a gym owner
  // must not be a way to read every competitor's application.
  const d = { ...deps({ applications: [{ id: 'a1', proposed_gym_name: 'Rival Gym' }] }), permissionsFor: async () => [] };
  const r = res();

  await handlePlatform(req({ url: '/platform/applications', cookie: session() }), r, d);

  assert.equal(r.statusCode, 403);
  assert.ok(!r.body.includes('Rival Gym'), 'not one competitor name leaks');
});

test('a gym owner cannot open one application either', async () => {
  const d = {
    ...deps({ application: { application: { id: 'a1', proposed_gym_name: 'Rival Gym' }, documents: [{ filename: 'their-id.pdf' }], events: [] } }),
    permissionsFor: async () => [],
  };
  const r = res();

  await handlePlatform(req({ url: '/platform/applications/a1', cookie: session() }), r, d);

  assert.equal(r.statusCode, 403);
  assert.ok(!r.body.includes('their-id.pdf'), 'nor their documents');
});

// ---------------------------------------------------------------------------
// The activation link must never vanish
// ---------------------------------------------------------------------------

test('when the activation email fails, the reviewer is HANDED the link', async () => {
  // The bug: approving provisioned a real database, generated a link, and then
  // nothing sent it and nothing showed it. The gym could never open.
  const d = {
    ...deps({ application: { application: { id: 'a1', status: 'submitted' }, documents: [], events: [] } }),
    decide: async () => ({
      ok: true,
      gym: { search_name: 'BOS GYM' },
      activation: {
        emailed: false,
        emailReason: 'email_not_configured',
        link: 'https://yoyogyms.com/platform/activate?token=abc123',
        code: '481920',
        to: 'ann@bos.co',
        expiresInHours: 48,
      },
    }),
  };
  const r = res();

  await handlePlatform(
    req({
      method: 'POST',
      url: '/platform/applications/a1/decide',
      cookie: session(),
      body: `action=approve&csrf=${encodeURIComponent(issueCsrfToken('staff-1'))}`,
    }),
    r,
    d
  );

  assert.equal(r.statusCode, 200, 'not a redirect — the link would be lost');
  assert.match(r.body, /abc123/, 'the link is handed over');
  assert.match(r.body, /481920/, 'and the code');
  assert.match(r.body, /shown once/i, 'and it says so, because only hashes are stored');
});

test('a successful activation email still redirects, and leaks nothing', async () => {
  const d = {
    ...deps({ application: { application: { id: 'a1', status: 'submitted' }, documents: [], events: [] } }),
    decide: async () => ({
      ok: true,
      activation: { emailed: true, link: 'https://x?token=secret', code: '111111' },
    }),
  };
  const r = res();

  await handlePlatform(
    req({
      method: 'POST',
      url: '/platform/applications/a1/decide',
      cookie: session(),
      body: `action=approve&csrf=${encodeURIComponent(issueCsrfToken('staff-1'))}`,
    }),
    r,
    d
  );

  assert.equal(r.statusCode, 302);
  assert.ok(!String(r.headers.location).includes('secret'), 'never in a URL — logs, history, referer');
  assert.ok(!r.body.includes('111111'));
});

test('a rejection still redirects as before', async () => {
  const d = deps({ application: { application: { id: 'a1', status: 'submitted' }, documents: [], events: [] } });
  const r = res();

  await handlePlatform(
    req({
      method: 'POST',
      url: '/platform/applications/a1/decide',
      cookie: session(),
      body: `action=reject&reason=no&csrf=${encodeURIComponent(issueCsrfToken('staff-1'))}`,
    }),
    r,
    d
  );

  assert.equal(r.statusCode, 302);
});

// ---------------------------------------------------------------------------
// The two prefixes
// ---------------------------------------------------------------------------

test('THE PANEL WORKS AT /platform/* AND AT /api/platform/*', async () => {
  // Vercel serves this handler at /api/platform/*, every link points at
  // /platform/*, and a rewrite maps one to the other. Which form a rewrite
  // presents in req.url is not worth betting a working panel on.
  for (const url of ['/platform/login', '/api/platform/login']) {
    const r = res();
    await handlePlatform(req({ url }), r, deps());

    assert.equal(r.statusCode, 200, `${url} should render the sign-in page`);
    assert.match(r.body, /Sign in/, `${url} rendered something else`);
  }
});

test('the /api/ prefix is stripped whole, not in pieces', async () => {
  // "/api/platform/gyms" must not become "/api/gyms" by having only its
  // middle removed — that would 404 every route under the API form.
  const d = { ...deps(), searchGyms: async () => [] };
  const r = res();

  await handlePlatform(req({ url: '/api/platform/gyms?q=x' }), r, d);

  assert.equal(r.statusCode, 200);
  assert.match(r.headers['content-type'], /json/);
});

test('a trailing slash does not break a route', async () => {
  const r = res();
  await handlePlatform(req({ url: '/platform/login/' }), r, deps());
  assert.equal(r.statusCode, 200);
});
