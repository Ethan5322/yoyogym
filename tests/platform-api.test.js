// The mobile app's API.
//
// The user's architecture: the WEBSITE is only the main admin panel, used by
// Yoyo staff. Gym owners and gym members use the APP. Both run on the same
// backend.
//
// "Same backend" is the claim these tests defend. Every route here must call
// the same injected dependency its HTML counterpart calls, so a rule cannot be
// enforced on one surface and forgotten on the other — which is exactly how an
// app becomes the weaker door.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.PLATFORM_JWT_SECRET ||= 'test-only-platform-secret-distinct';

import { handlePlatform } from '../platform/router.js';
import { signPlatformToken } from '../platform/http.js';

const OWNER = { id: 'owner-1', email: 'ann@bos.co', kind: 'gym_owner' };
const STAFF = { id: 'staff-1', email: 'me@yoyogyms.com', kind: 'platform_staff' };

const bearer = (user) => ({ authorization: `Bearer ${signPlatformToken(user)}` });

function req({ method = 'GET', url = '', body = null, headers = {} } = {}) {
  const raw = body === null ? '' : JSON.stringify(body);
  const r = { method, url, headers: { 'content-type': 'application/json', ...headers }, _body: raw };
  r[Symbol.asyncIterator] = async function* () { if (r._body) yield Buffer.from(r._body); };
  return r;
}

function res() {
  return {
    statusCode: 200, headers: {}, body: '',
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

const APPLICATION = { id: 'app-1', applicant_user_id: 'owner-1', proposed_gym_name: 'BOS GYM', status: 'submitted' };

function deps(over = {}) {
  const calls = { created: [], audits: [], recorded: [] };
  return {
    calls,
    audit: async (a) => { calls.audits.push(a); },
    findUserByEmail: async (email) =>
      email === 'ann@bos.co'
        ? { ...OWNER, password_hash: 'h', totp_enabled: false, is_active: true }
        : email === 'me@yoyogyms.com'
          ? { ...STAFF, password_hash: 'h', totp_enabled: false, is_active: true }
          : null,
    verifyPassword: async (plain) => plain === 'correct-horse',
    saveLoginState: async () => {},
    verifySecondFactor: async () => false,
    searchGyms: async () => [{ slug: 'bos-gym', name: 'BOS GYM', city: 'Cape Town', distance_km: 2 }],
    createApplication: async (input) => { calls.created.push(input); return { ok: true, applicationId: 'app-1' }; },
    ownerDashboard: async () => ({
      gym: {
        slug: 'bos-gym', search_name: 'BOS GYM', status: 'active',
        plan_key: 'basic', city: 'Cape Town', schema_name: 'gym_bos',
      },
      application: APPLICATION,
      subscription: { status: 'trialing', trial_ends_at: '2026-10-22T00:00:00Z' },
      documents: [{ id: 'd1', doc_type: 'id_document', filename: 'id.pdf', status: 'pending' }],
    }),
    findOwnApplication: async (userId, id) => (userId === 'owner-1' && id === 'app-1' ? APPLICATION : null),
    createSignedUpload: async (path) => ({ path, token: 'signed', uploadUrl: 'https://storage/put' }),
    recordDocument: async (row) => { calls.recorded.push(row); return { ...row, id: 'doc-1' }; },
    ...over,
  };
}

const body = (r) => JSON.parse(r.body);

// ---------------------------------------------------------------------------
// The app signs in with a token, not a cookie
// ---------------------------------------------------------------------------

test('an owner signs in and receives a TOKEN, not a Set-Cookie', async () => {
  const r = res();
  await handlePlatform(
    req({ method: 'POST', url: '/platform/api/login', body: { email: 'ann@bos.co', password: 'correct-horse' } }),
    r, deps()
  );

  assert.equal(r.statusCode, 200);
  assert.ok(body(r).token, 'the app stores this itself');
  assert.ok(!r.getHeader('set-cookie'), 'an app has no cookie jar worth relying on');
  assert.equal(body(r).user.kind, 'gym_owner');
});

test('THE SAME 2FA RULE APPLIES IN THE APP AS ON THE WEBSITE', async () => {
  // The whole risk of a second surface: the app quietly becomes the weaker
  // door. Staff without 2FA are refused here exactly as they are on the web.
  const r = res();
  await handlePlatform(
    req({ method: 'POST', url: '/platform/api/login', body: { email: 'me@yoyogyms.com', password: 'correct-horse' } }),
    r, deps()
  );

  assert.equal(r.statusCode, 403);
  assert.match(body(r).error, /two-factor/i);
});

test('a wrong password gives the same generic message', async () => {
  const r = res();
  await handlePlatform(
    req({ method: 'POST', url: '/platform/api/login', body: { email: 'ann@bos.co', password: 'wrong' } }),
    r, deps()
  );

  assert.equal(r.statusCode, 401);
  assert.match(body(r).error, /Invalid email, password/);
});

test('an unknown email gives that same message, so accounts cannot be discovered', async () => {
  const r = res();
  await handlePlatform(
    req({ method: 'POST', url: '/platform/api/login', body: { email: 'nobody@x.co', password: 'correct-horse' } }),
    r, deps()
  );

  assert.equal(body(r).error, 'Invalid email, password or authentication code.');
});

// ---------------------------------------------------------------------------
// The bearer token IS the session
// ---------------------------------------------------------------------------

test('a bearer token from login works on a protected route', async () => {
  const r = res();
  await handlePlatform(req({ url: '/platform/api/my-gym', headers: bearer(OWNER) }), r, deps());

  assert.equal(r.statusCode, 200);
  assert.equal(body(r).gym.name, 'BOS GYM');
});

test('no token means 401 JSON, not a redirect to a login PAGE', async () => {
  // A redirect to HTML is useless to an app; it would render a login page
  // inside a JSON parser.
  const r = res();
  await handlePlatform(req({ url: '/platform/api/my-gym' }), r, deps());

  assert.equal(r.statusCode, 401);
  assert.match(r.headers['content-type'], /json/);
});

test('a forged token is refused', async () => {
  const r = res();
  await handlePlatform(
    req({ url: '/platform/api/my-gym', headers: { authorization: 'Bearer not.a.token' } }),
    r, deps()
  );

  assert.equal(r.statusCode, 401);
});

// ---------------------------------------------------------------------------
// What the app is told about a gym
// ---------------------------------------------------------------------------

test('THE SCHEMA NAME NEVER REACHES THE APP', async () => {
  // The isolation boundary. The dashboard row contains it; the response must
  // not, which is why the API shapes its output instead of echoing rows.
  const r = res();
  await handlePlatform(req({ url: '/platform/api/my-gym', headers: bearer(OWNER) }), r, deps());

  assert.ok(!r.body.includes('gym_bos'), 'no schema name');
  assert.ok(!r.body.includes('schema'), 'nor the word');
});

test('the gym search is public and needs no token', async () => {
  const r = res();
  await handlePlatform(req({ url: '/platform/api/gyms?q=BOS' }), r, deps());

  assert.equal(r.statusCode, 200);
  assert.equal(body(r).gyms[0].slug, 'bos-gym');
});

test('the plans are readable without an account, for the signup screen', async () => {
  const r = res();
  await handlePlatform(req({ url: '/platform/api/plans' }), r, deps());

  assert.equal(r.statusCode, 200);
  assert.equal(body(r).plans.length, 3);
  assert.ok(body(r).plans[0].memberBenefits, 'leads with what members can do');
});

// ---------------------------------------------------------------------------
// Applying from the app
// ---------------------------------------------------------------------------

test('the app applies through the SAME validation as the web form', async () => {
  const d = deps();
  const r = res();

  await handlePlatform(
    req({ method: 'POST', url: '/platform/api/apply',
          body: { owner_name: 'Ann', email: 'a@b.co', password: 'short', gym_name: 'X', plan: 'basic' } }),
    r, d
  );

  assert.equal(r.statusCode, 400);
  assert.match(body(r).error, /10 characters/);
  assert.equal(d.calls.created.length, 0);
});

test('an application without a plan is refused in the app too', async () => {
  const d = deps();
  const r = res();

  await handlePlatform(
    req({ method: 'POST', url: '/platform/api/apply',
          body: { owner_name: 'Ann', email: 'a@b.co', password: 'longenough1', gym_name: 'X' } }),
    r, d
  );

  assert.equal(r.statusCode, 400);
  assert.equal(d.calls.created.length, 0);
});

test('a valid application is created and normalised identically', async () => {
  const d = deps();
  const r = res();

  await handlePlatform(
    req({ method: 'POST', url: '/platform/api/apply',
          body: { owner_name: 'Ann', email: 'ANN@Bos.co', password: 'longenough1', gym_name: 'BOS GYM', country: 'za', plan: 'medium' } }),
    r, d
  );

  assert.equal(r.statusCode, 201);
  assert.equal(d.calls.created[0].email, 'ann@bos.co');
  assert.equal(d.calls.created[0].country, 'ZA');
});

// ---------------------------------------------------------------------------
// Documents from the app
// ---------------------------------------------------------------------------

test('an owner cannot upload into another application from the app either', async () => {
  const d = deps();
  const r = res();

  await handlePlatform(
    req({ method: 'POST', url: '/platform/api/my-gym/documents/request', headers: bearer(OWNER),
          body: { application_id: 'someone-elses', doc_type: 'id_document', mime_type: 'application/pdf', size_bytes: 1000 } }),
    r, d
  );

  assert.equal(r.statusCode, 404);
});

test('a confirmed path outside the application is refused in the app too', async () => {
  const d = deps();
  const r = res();

  await handlePlatform(
    req({ method: 'POST', url: '/platform/api/my-gym/documents/confirm', headers: bearer(OWNER),
          body: { application_id: 'app-1', doc_type: 'id_document', storage_ref: 'applications/other/x.pdf', mime_type: 'application/pdf', size_bytes: 10 } }),
    r, d
  );

  assert.equal(r.statusCode, 400);
  assert.equal(d.calls.recorded.length, 0);
});

test('an executable is refused in the app too', async () => {
  const d = deps();
  const r = res();

  await handlePlatform(
    req({ method: 'POST', url: '/platform/api/my-gym/documents/request', headers: bearer(OWNER),
          body: { application_id: 'app-1', doc_type: 'id_document', mime_type: 'application/x-msdownload', size_bytes: 10 } }),
    r, d
  );

  assert.equal(r.statusCode, 400);
});

// ---------------------------------------------------------------------------
// What the app may NOT do
// ---------------------------------------------------------------------------

test('there is no app route that approves an application', async () => {
  // Staff work happens on the website. An app endpoint that provisions a gym
  // would be a second, less-guarded path to the most consequential action here.
  const r = res();
  await handlePlatform(
    req({ method: 'POST', url: '/platform/api/applications/app-1/decide', headers: bearer(STAFF), body: { action: 'approve' } }),
    r, deps()
  );

  assert.equal(r.statusCode, 404);
});

test('there is no app route that suspends a gym', async () => {
  const r = res();
  await handlePlatform(
    req({ method: 'POST', url: '/platform/api/registry/gym-1/suspend', headers: bearer(STAFF), body: {} }),
    r, deps()
  );

  assert.equal(r.statusCode, 404);
});

test('an unknown api path is a JSON 404, never an HTML page', async () => {
  const r = res();
  await handlePlatform(req({ url: '/platform/api/nope' }), r, deps());

  assert.equal(r.statusCode, 404);
  assert.match(r.headers['content-type'], /json/);
});
