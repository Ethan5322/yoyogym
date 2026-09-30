// Closing a gym owner's account within 30 days (CLAUDE.md §46.1 Q3): Yoyo
// staff may close it sooner, the nightly job closes it on day 30, and both do
// the same thing — gyms suspended, sign-in off, personal details erased, a
// confirmation to the address they had.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.PLATFORM_JWT_SECRET ||= 'test-only-signing-key-not-used-anywhere';

const { fakeDb } = await import('./fake-db.js');
const { closeOwnerAccount, closeDueAccounts, closeBy, CLOSURE_DAYS } = await import('../platform/owner-closure.js');
const { handlePlatform } = await import('../platform/router.js');
const { sessionCookie, issueCsrfToken } = await import('../platform/http.js');
const { ownersPage, ownerDashboardPage, deleteAccountPage } = await import('../platform/views.js');

const DAY = 24 * 60 * 60 * 1000;

function platform(extra = {}) {
  return fakeDb({
    platform_users: [
      { id: 'o1', kind: 'gym_owner', email: 'ann@bos.co', full_name: 'Ann Bos', is_active: true, password_hash: 'h', totp_secret: 's', totp_enabled: true, recovery_code_hashes: ['x'], closure_requested_at: '2026-09-01T00:00:00Z', closure_completed_at: null },
      { id: 'o2', kind: 'gym_owner', email: 'ben@kom.co', full_name: 'Ben Kom', is_active: true, closure_requested_at: null, closure_completed_at: null },
      { id: 's1', kind: 'platform_staff', email: 'staff@yoyo.co', full_name: 'Staff', is_active: true, closure_requested_at: '2026-09-01T00:00:00Z', closure_completed_at: null },
    ],
    gyms: [
      { id: 'g1', owner_user_id: 'o1', status: 'active' },
      { id: 'g2', owner_user_id: 'o2', status: 'active' },
    ],
    gym_applications: [
      { id: 'a1', applicant_user_id: 'o1', owner_phone: '+27821234567' },
      { id: 'a2', applicant_user_id: 'o2', owner_phone: '+27831234567' },
    ],
    ...extra,
  });
}

test('closing an account suspends the gym, erases the details and emails the address it had', async () => {
  const db = platform();
  const sent = [];
  const result = await closeOwnerAccount(db, 'o1', { sendEmail: async (m) => { sent.push(m); return { ok: true }; }, now: new Date('2026-10-01T00:00:00Z') });
  assert.deepEqual(result, { ok: true, gymsSuspended: 1, emailed: true });
  assert.equal(db.tables.gyms.find((g) => g.id === 'g1').status, 'suspended');
  assert.equal(db.tables.gyms.find((g) => g.id === 'g2').status, 'active', 'another owner\'s gym is untouched');

  const o1 = db.tables.platform_users.find((u) => u.id === 'o1');
  assert.equal(o1.is_active, false);
  assert.equal(o1.full_name, 'Closed account');
  assert.equal(o1.email, 'closed-o1@closed.invalid');
  assert.equal(o1.password_hash, null);
  assert.equal(o1.totp_secret, null);
  assert.deepEqual(o1.recovery_code_hashes, []);
  assert.ok(o1.closure_completed_at);
  assert.equal(db.tables.gym_applications.find((a) => a.id === 'a1').owner_phone, null);
  assert.equal(db.tables.gym_applications.find((a) => a.id === 'a2').owner_phone, '+27831234567');

  // The confirmation went to the address the owner HAD, before it was erased.
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'ann@bos.co');
  assert.match(sent[0].subject, /closed/);
});

test('closing twice does nothing the second time, and a Yoyo staff account is never closed here', async () => {
  const db = platform();
  await closeOwnerAccount(db, 'o1');
  assert.deepEqual(await closeOwnerAccount(db, 'o1'), { ok: true, already: true });
  assert.deepEqual(await closeOwnerAccount(db, 's1'), { ok: false, reason: 'not_an_owner' });
  assert.equal(db.tables.platform_users.find((u) => u.id === 's1').is_active, true);
});

test('the nightly job closes accounts 30 days after the owner asked — not before', async () => {
  const now = new Date('2026-10-15T02:00:00Z');
  const db = platform();
  db.tables.platform_users.find((u) => u.id === 'o1').closure_requested_at = new Date(now - CLOSURE_DAYS * DAY - 1000).toISOString();
  db.tables.platform_users.find((u) => u.id === 'o2').closure_requested_at = new Date(now - (CLOSURE_DAYS - 1) * DAY).toISOString();
  const result = await closeDueAccounts(db, { now });
  assert.deepEqual(result, { ok: true, due: 1, closed: ['o1'] });
  assert.equal(db.tables.platform_users.find((u) => u.id === 'o2').is_active, true);
});

test('the nightly job runs the closures and records each one', () => {
  const router = readFileSync('platform/router.js', 'utf8');
  assert.match(router, /closures = \(await deps\.closeDueAccounts\?\.\(\{ now: new Date\(\) \}\)\)/);
  assert.match(router, /action: 'platform\.owner\.closed',\s*actor_kind: 'system'/);
});

function staffCall(path, permissions) {
  const staff = { id: 'staff-1', email: 'staff@yoyo.co', kind: 'platform_staff' };
  const body = `csrf=${encodeURIComponent(issueCsrfToken('staff-1'))}`;
  const req = {
    method: 'POST', url: path,
    headers: { cookie: sessionCookie(staff).split(';')[0], 'content-type': 'application/x-www-form-urlencoded' },
    _body: body,
  };
  req[Symbol.asyncIterator] = async function* () { yield Buffer.from(req._body); };
  const res = {
    statusCode: 200, headers: {}, body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    getHeader(k) { return this.headers[k.toLowerCase()]; },
    writeHead(code, h) { this.statusCode = code; for (const [k, v] of Object.entries(h || {})) this.headers[k.toLowerCase()] = v; return this; },
    end(b) { this.body = b || ''; return this; },
  };
  const calls = { closed: [], audits: [] };
  const deps = {
    permissionsFor: async () => permissions,
    audit: async (a) => { calls.audits.push(a); },
    closeOwnerAccount: async (id) => { calls.closed.push(id); return { ok: true, gymsSuspended: 1, emailed: true }; },
  };
  return { req, res, deps, calls };
}

test('"Close now" needs permission to manage owners, and is audited', async () => {
  const refused = staffCall('/platform/owners/o1/close', []);
  await handlePlatform(refused.req, refused.res, refused.deps);
  assert.equal(refused.res.statusCode, 403);
  assert.deepEqual(refused.calls.closed, []);

  const allowed = staffCall('/platform/owners/o1/close', ['platform.manage']);
  await handlePlatform(allowed.req, allowed.res, allowed.deps);
  assert.equal(allowed.res.statusCode, 302);
  assert.deepEqual(allowed.calls.closed, ['o1']);
  assert.equal(allowed.calls.audits[0].action, 'platform.owner.closed');
});

test('the owner list shows the closing date and "Close now"; a closed account says so', () => {
  const page = ownersPage({
    owners: [
      { id: 'o1', email: 'ann@bos.co', full_name: 'Ann', is_active: true, closure_requested_at: '2026-09-01T00:00:00Z', gym_count: 1 },
      { id: 'o3', email: 'closed-o3@closed.invalid', full_name: 'Closed account', is_active: false, closure_completed_at: '2026-09-20T00:00:00Z', gym_count: 1 },
    ],
    csrfToken: 't',
  });
  assert.match(page, /action="\/platform\/owners\/o1\/close"/);
  assert.match(page, /closes /);
  assert.match(page, /Account closed/);
  assert.doesNotMatch(page, /owners\/o3\/(close|reactivate)/);
});

test('the owner is told it is finished within 30 days, and by which date', () => {
  assert.match(ownerDashboardPage({ csrfToken: 't' }), /closed within 30 days/);
  const asked = ownerDashboardPage({ csrfToken: 't', closureRequestedAt: '2026-09-01T00:00:00Z' });
  assert.match(asked, /It will be closed by/);
  assert.equal(closeBy('2026-09-01T00:00:00Z').toISOString(), '2026-10-01T00:00:00.000Z');
  assert.match(deleteAccountPage(), /closed within\s+30 days/);
});
