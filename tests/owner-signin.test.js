// CLAUDE.md §43, §43.1 — for EVERY gym owner, not only the first one:
//   Q1  an activation link and code last 10 minutes; one link a day per person
//   Q2  an owner signs in from the app with email + password alone
//   Q3  the website is not an installable web app
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import bcrypt from 'bcryptjs';

process.env.JWT_SECRET ||= 'test-only-gym-secret';
process.env.PLATFORM_JWT_SECRET ||= 'test-only-platform-secret-distinct';

import { fakeDb } from './fake-db.js';
// Loaded after the secret is set: the auth module refuses to load without one.
const { default: ownerLogin } = await import('../server/handlers/auth/owner-login.js');
const { verifyToken } = await import('../server/lib/auth.js');
import { activationDeps } from '../platform/deps.js';
import { handlePlatform } from '../platform/router.js';
import { activatePage } from '../platform/views.js';

// ---------------------------------------------------------------------------
// Q2 — email + password, the gym found for the owner
// ---------------------------------------------------------------------------

const hash = (p) => bcrypt.hashSync(p, 4);

/** A registry with gyms, each with its OWN accounts in its own fake schema. */
function registry(gyms, owners = {}) {
  const schemas = Object.fromEntries(gyms.map((g) => [g.slug, fakeDb({ admin_users: g.admins })]));
  return {
    schemas,
    ownerGymSlugs: async (email) => owners[email] || [],
    lookupGym: async (slug) => {
      const g = gyms.find((x) => x.slug === slug);
      return g ? { gym: { id: `id-${slug}`, slug, status: g.status || 'active', search_name: g.name }, connection: { schema_name: `gym_${slug.replace(/-/g, '_')}`, status: 'healthy' }, plan: { key: 'basic', features: [] } } : null;
    },
    shared: { url: 'https://x.supabase.co', key: 'k' },
    createClient: (url, key, opts) => schemas[opts.db.schema.replace(/^gym_/, '').replace(/_/g, '-')],
  };
}

const owner = (email, password, extra = {}) => ({ id: `u-${email}`, username: 'owner', email, password_hash: hash(password), role: 'owner', is_active: true, failed_logins: 0, full_name: 'Owner', ...extra });

let ip = 0;
function post(body) {
  // A different address each call, so the sign-in rate limit never decides a test.
  return { method: 'POST', headers: { 'x-forwarded-for': `10.0.0.${++ip}` }, body, socket: {} };
}
function res() {
  return {
    statusCode: 200, headers: {}, body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    getHeader(k) { return this.headers[k.toLowerCase()]; },
    writeHead(code, h) { this.statusCode = code; Object.assign(this.headers, h || {}); return this; },
    end(b) { this.body = b || ''; return this; },
    status(code) { this.statusCode = code; return this; },
    json(o) { this.body = JSON.stringify(o); return this; },
  };
}
const body = (r) => JSON.parse(r.body || '{}');

test('AN OWNER SIGNS IN WITH EMAIL + PASSWORD, and lands in THEIR gym, with a token stamped for it', async () => {
  const reg = registry(
    [{ slug: 'cocate-gym', name: 'COCATE GYM', admins: [owner('kuma@example.com', 'the-right-one-1')] }],
    { 'kuma@example.com': ['cocate-gym'] }
  );
  const r = res();
  await ownerLogin(post({ email: ' Kuma@Example.com ', password: 'the-right-one-1', remember: true }), r, { tenancy: reg });
  assert.equal(r.statusCode, 200, r.body);
  const out = body(r);
  assert.deepEqual(out.gym, { slug: 'cocate-gym', name: 'COCATE GYM' });
  assert.equal(out.user.role, 'owner');
  assert.equal(verifyToken(out.token).gym, 'cocate-gym', 'the token belongs to that gym and no other');
});

test('a wrong password is refused generically, and counts against the account (lockout)', async () => {
  const reg = registry([{ slug: 'cocate-gym', name: 'COCATE GYM', admins: [owner('kuma@example.com', 'the-right-one-1')] }], { 'kuma@example.com': ['cocate-gym'] });
  const r = res();
  await ownerLogin(post({ email: 'kuma@example.com', password: 'not-it' }), r, { tenancy: reg });
  assert.equal(r.statusCode, 401);
  assert.equal(body(r).error, 'Invalid email or password');
  assert.equal(reg.schemas['cocate-gym'].tables.admin_users[0].failed_logins, 1);
});

test('an email that owns no gym reads EXACTLY like a wrong password', async () => {
  const reg = registry([], {});
  const r = res();
  await ownerLogin(post({ email: 'nobody@example.com', password: 'whatever-1' }), r, { tenancy: reg });
  assert.equal(r.statusCode, 401);
  assert.equal(body(r).error, 'Invalid email or password');
});

test('a locked account says it is locked, instead of trying anything else', async () => {
  const locked = owner('kuma@example.com', 'the-right-one-1', { locked_until: new Date(Date.now() + 600_000).toISOString() });
  const reg = registry([{ slug: 'cocate-gym', name: 'COCATE GYM', admins: [locked] }], { 'kuma@example.com': ['cocate-gym'] });
  const r = res();
  await ownerLogin(post({ email: 'kuma@example.com', password: 'the-right-one-1' }), r, { tenancy: reg });
  assert.equal(r.statusCode, 401);
  assert.match(body(r).error, /locked/);
});

test('WORKS FOR ANY OWNER: one who owns two gyms is signed in where the password matches', async () => {
  const reg = registry(
    [
      { slug: 'first-gym', name: 'First', admins: [owner('two@example.com', 'first-password-1')] },
      { slug: 'second-gym', name: 'Second', admins: [owner('two@example.com', 'second-password-2')] },
    ],
    { 'two@example.com': ['first-gym', 'second-gym'] }
  );
  const r = res();
  await ownerLogin(post({ email: 'two@example.com', password: 'second-password-2' }), r, { tenancy: reg });
  assert.equal(r.statusCode, 200);
  assert.equal(body(r).gym.slug, 'second-gym');
});

test('the password is checked by the GYM, against the gym\'s own account — never another gym\'s', async () => {
  // Same email at two gyms; the email's owner record lists only one of them.
  const reg = registry(
    [
      { slug: 'mine', name: 'Mine', admins: [owner('ann@example.com', 'my-password-1')] },
      { slug: 'theirs', name: 'Theirs', admins: [owner('ann@example.com', 'my-password-1')] },
    ],
    { 'ann@example.com': ['mine'] }
  );
  const r = res();
  await ownerLogin(post({ email: 'ann@example.com', password: 'my-password-1' }), r, { tenancy: reg });
  assert.equal(body(r).gym.slug, 'mine');
});

test('email and password are both required', async () => {
  const r = res();
  await ownerLogin(post({ email: 'no-at-sign', password: '' }), r, { tenancy: registry([], {}) });
  assert.equal(r.statusCode, 400);
});

test('the website page stores the session where the gym\'s own sign-in does, and opens the gym', () => {
  const page = readFileSync(new URL('../src/pages/OwnerLogin.jsx', import.meta.url), 'utf8');
  assert.match(page, /fetch\('\/api\/auth\/owner-login'/);
  assert.match(page, /tokenKey\(ADMIN_TOKEN, data\.gym\.slug\)/, 'the per-gym key the admin panel reads');
  assert.match(page, /\/g\/\$\{encodeURIComponent\(slug\)\}\/admin\/login/);
  assert.match(page, /\/platform\/forgot/, 'a way back in');
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /<Route path="\/owner\/login" element=\{<OwnerLogin \/>\} \/>/);
});

// ---------------------------------------------------------------------------
// Q1 — ten minutes, one link a day
// ---------------------------------------------------------------------------

function activationDb(lastSentHoursAgo) {
  const rows = lastSentHoursAgo === null ? [] : [{
    id: 'a-old', user_id: 'owner-1', gym_id: 'g1', token_hash: 'old', code_hash: 'old',
    expires_at: new Date(Date.now() - lastSentHoursAgo * 3_600_000 + 600_000).toISOString(),
    used_at: null, created_at: new Date(Date.now() - lastSentHoursAgo * 3_600_000).toISOString(),
  }];
  return fakeDb({
    owner_activations: rows,
    platform_users: [{ id: 'owner-1', email: 'kuma@example.com' }],
    gyms: [{ id: 'g1', search_name: 'COCATE GYM' }],
    platform_audit_log: [],
  });
}

test('Q1 A SECOND LINK WITHIN 24 HOURS IS REFUSED — and the one they have is not killed', async () => {
  const db = activationDb(3);
  const out = await activationDeps(db).issueActivation({ userId: 'owner-1', gymId: 'g1' });
  assert.equal(out.limited, true);
  assert.ok(new Date(out.nextAt).getTime() > Date.now() + 20 * 3_600_000, 'about 21 hours from now');
  assert.equal(db.tables.owner_activations.length, 1, 'nothing new made');
  assert.equal(db.tables.owner_activations[0].used_at, null, 'the existing link still works');
});

test('Q1 a day later a new link is made, it lasts 10 minutes, and the old one is retired', async () => {
  const db = activationDb(25);
  const out = await activationDeps(db).issueActivation({ userId: 'owner-1', gymId: 'g1' });
  assert.ok(!out.limited);
  assert.equal(out.expiresInMinutes, 10);
  assert.equal(db.tables.owner_activations.length, 2);
  const fresh = db.tables.owner_activations[1];
  const minutes = (new Date(fresh.expires_at).getTime() - Date.now()) / 60_000;
  assert.ok(minutes > 9 && minutes <= 10, `lasts ten minutes (${minutes})`);
  assert.ok(db.tables.owner_activations[0].used_at, 'the old link stops working');
});

test('Q1 the very first link (at approval) is never held back', async () => {
  const db = activationDb(null);
  const out = await activationDeps(db).issueActivation({ userId: 'owner-1', gymId: 'g1' });
  assert.ok(!out.limited);
});

test('Q1 an expired link offers the next one on the page itself', () => {
  const page = activatePage({ token: 'tok', expired: true });
  assert.match(page, /This link has expired/);
  assert.match(page, /action="\/platform\/activate\/renew"/);
  assert.match(page, /one link a day/);
  assert.doesNotMatch(page, /name="code"/, 'no code form for a dead link');
});

async function renew(deps) {
  const r = res();
  const q = { method: 'POST', url: '/platform/activate/renew', headers: { 'content-type': 'application/x-www-form-urlencoded' } };
  q[Symbol.asyncIterator] = async function* () { yield Buffer.from('token=tok'); };
  await handlePlatform(q, r, { audit: async () => {}, ...deps });
  return r;
}

test('Q1 asking again within the day says when, and sends nothing', async () => {
  let sent = 0;
  const r = await renew({
    renewActivation: async () => ({ ok: true, userId: 'u', gymId: 'g' }),
    issueActivation: async () => { sent += 1; return { limited: true, nextAt: new Date(Date.now() + 5 * 3_600_000).toISOString() }; },
  });
  assert.equal(r.statusCode, 429);
  assert.match(r.body, /One link a day/);
  assert.match(r.body, /in about 5 hours/);
  assert.equal(sent, 1, 'asked once; the rule said no');
});

test('Q1 after a day, the owner gets a new 10-minute link by email', async () => {
  const r = await renew({
    renewActivation: async () => ({ ok: true, userId: 'u', gymId: 'g' }),
    issueActivation: async () => ({ emailed: true, expiresInMinutes: 10 }),
  });
  assert.equal(r.statusCode, 200);
  assert.match(r.body, /A new link is on its way/);
  assert.match(r.body, /10 minutes/);
});

test('Q1 a link already used says the account is active', async () => {
  const r = await renew({ renewActivation: async () => ({ ok: false, reason: 'used' }), issueActivation: async () => { throw new Error('must not issue'); } });
  assert.match(r.body, /already active/);
});

// ---------------------------------------------------------------------------
// Q3 — no web app
// ---------------------------------------------------------------------------

test('Q3 THE WEBSITE IS NOT AN INSTALLABLE WEB APP', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /rel="manifest"/);
  assert.doesNotMatch(html, /apple-mobile-web-app-capable/);
  assert.ok(!existsSync(new URL('../public/manifest.webmanifest', import.meta.url)));
  const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(main, /serviceWorker\.register\(/);
  assert.match(main, /unregister\(\)/, 'a browser that installed the old one lets it go');
  const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
  assert.match(sw, /self\.registration\.unregister\(\)/);
});

test("THE REGISTRY'S OWNER LOOKUP IS NOT LIMITED TO GYM-OWNER ACCOUNTS — KOM's owner is a staff account", () => {
  const src = readFileSync(new URL('../server/lib/tenancy-deps.js', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('ownerGymSlugs: async'), src.indexOf('lookupGym: async'));
  assert.doesNotMatch(fn, /\.eq\('kind', 'gym_owner'\)/, 'KOM is owned by the platform owner\'s staff account');
  assert.match(fn, /\.eq\('is_active', true\)/, 'a switched-off account owns nothing');
  assert.match(fn, /\.eq\('status', 'active'\)/, 'only open gyms');
});
