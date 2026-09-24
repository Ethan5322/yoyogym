// "I forgot my password" — for gym owners and Yoyo staff.
//
// There was no way back in: no reset route on the website or in the app. And
// because activation gives an owner the same password on the platform AND
// inside their gym, a reset that changed only one would leave them locked out
// of the place they actually needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.PLATFORM_JWT_SECRET ||= 'test-only-platform-secret-distinct';

import {
  requestReset, completeReset, checkReset, issueReset, resetLookupHash, REQUESTED, RESET_TTL_MINUTES,
} from '../platform/password-reset.js';
import { handlePlatform } from '../platform/router.js';
import { verifyPassword } from '../platform/auth.js';

const NOW = new Date('2026-09-24T10:00:00Z');

/** Accounts, resets, gyms and outgoing mail, in memory. */
function world({ user = {}, gyms = ['gym-1'] } = {}) {
  const account = {
    id: 'u1', email: 'ann@bos.co', kind: 'gym_owner', is_active: true,
    password_hash: 'old-hash', failed_logins: 3, locked_until: '2026-09-24T10:10:00Z', ...user,
  };
  const w = {
    account,
    resets: [],
    mail: [],
    gymPasswords: {},
    audits: [],
    findUserByEmail: async (email) => (email === account.email ? { ...account } : null),
    saveReset: async (row) => { w.resets.push({ id: `r${w.resets.length}`, ...row }); },
    findReset: async (hash) => w.resets.find((r) => r.token_hash === hash) ?? null,
    markResetsUsed: async (userId, at) => {
      for (const r of w.resets) if (r.user_id === userId && !r.used_at) r.used_at = at;
    },
    sendResetEmail: async ({ to, token }) => { w.mail.push({ to, token }); return { ok: true }; },
    gymsOwnedBy: async () => gyms,
    createGymAdmin: async ({ gymId, password }) => { w.gymPasswords[gymId] = password; return true; },
    setPassword: async (_id, hash) => { account.password_hash = hash; },
    saveLoginState: async (_id, patch) => Object.assign(account, patch),
    audit: async (a) => { w.audits.push(a); },
  };
  return w;
}

// ---------------------------------------------------------------------------
// Asking
// ---------------------------------------------------------------------------

test('THE ANSWER IS THE SAME WHETHER OR NOT THE ACCOUNT EXISTS', async () => {
  const w = world();
  const known = await requestReset(w, { email: 'ann@bos.co' }, NOW);
  const unknown = await requestReset(w, { email: 'nobody@x.co' }, NOW);

  assert.equal(known.message, REQUESTED);
  assert.equal(unknown.message, REQUESTED);
  assert.equal(w.mail.length, 1, 'but only the real account gets an email');
});

test('a failure to save does not turn into an error that reveals the account exists', async () => {
  // Before the migration runs, saveReset throws — and only for real accounts.
  const w = world();
  w.saveReset = async () => { throw new Error('relation "password_resets" does not exist'); };
  const result = await requestReset(w, { email: 'ann@bos.co' }, NOW);
  assert.equal(result.message, REQUESTED);
});

test('only the hash is stored; the raw token only goes in the email', async () => {
  const w = world();
  await requestReset(w, { email: 'ann@bos.co' }, NOW);
  const { token } = w.mail[0];

  assert.equal(w.resets[0].token_hash, resetLookupHash(token));
  assert.ok(!JSON.stringify(w.resets).includes(token));
  assert.ok(!JSON.stringify(w.audits).includes(token), 'nor in the audit log');
});

test('a deactivated account is not reset — deactivation is a decision', async () => {
  const w = world({ user: { is_active: false } });
  await requestReset(w, { email: 'ann@bos.co' }, NOW);
  assert.equal(w.mail.length, 0);
});

// ---------------------------------------------------------------------------
// Using the link
// ---------------------------------------------------------------------------

async function linkFor(w) {
  await requestReset(w, { email: 'ann@bos.co' }, NOW);
  return w.mail.at(-1).token;
}

test('THE OWNER\'S GYM SIGN-IN CHANGES TOO', async () => {
  // Otherwise they are back on the platform and still locked out of their gym.
  const w = world({ gyms: ['gym-1', 'gym-2'] });
  const token = await linkFor(w);
  const result = await completeReset(w, { token, password: 'new-password-123' }, NOW);

  assert.equal(result.ok, true);
  assert.equal(w.gymPasswords['gym-1'], 'new-password-123');
  assert.equal(w.gymPasswords['gym-2'], 'new-password-123');
  assert.ok(await verifyPassword('new-password-123', w.account.password_hash));
});

test('A LINK WORKS ONCE', async () => {
  const w = world();
  const token = await linkFor(w);
  assert.equal((await completeReset(w, { token, password: 'new-password-123' }, NOW)).ok, true);
  assert.equal((await completeReset(w, { token, password: 'another-password-9' }, NOW)).ok, false);
});

test('using one link kills every other open link for that account', async () => {
  const w = world();
  const first = await linkFor(w);
  const second = await linkFor(w);
  await completeReset(w, { token: second, password: 'new-password-123' }, NOW);
  assert.equal((await completeReset(w, { token: first, password: 'x'.repeat(12) }, NOW)).ok, false);
});

test('a link is dead after an hour', async () => {
  const w = world();
  const token = await linkFor(w);
  const later = new Date(NOW.getTime() + RESET_TTL_MINUTES * 60_000 + 1);
  assert.equal((await completeReset(w, { token, password: 'new-password-123' }, later)).ok, false);
});

test('a too-short password does not burn the link', async () => {
  const w = world();
  const token = await linkFor(w);
  assert.equal((await completeReset(w, { token, password: 'short' }, NOW)).ok, false);
  assert.equal((await completeReset(w, { token, password: 'long-enough-now' }, NOW)).ok, true);
});

test('if the gym sign-in cannot be updated, the link still works', async () => {
  const w = world();
  const token = await linkFor(w);
  w.createGymAdmin = async () => false;
  assert.equal((await completeReset(w, { token, password: 'new-password-123' }, NOW)).ok, false);
  assert.equal(w.account.password_hash, 'old-hash', 'nothing half-changed');

  w.createGymAdmin = async () => true;
  assert.equal((await completeReset(w, { token, password: 'new-password-123' }, NOW)).ok, true);
});

test('a reset lifts a lockout', async () => {
  const w = world();
  const token = await linkFor(w);
  await completeReset(w, { token, password: 'new-password-123' }, NOW);
  assert.equal(w.account.failed_logins, 0);
  assert.equal(w.account.locked_until, null);
});

test('a guessed token is refused with the same words as an expired one', () => {
  const { row } = issueReset({ userId: 'u1', now: NOW });
  const guessed = checkReset(row, 'f'.repeat(64), NOW);
  const expired = checkReset(row, 'f'.repeat(64), new Date(NOW.getTime() + 2 * 3_600_000));
  assert.equal(guessed.ok, false);
  assert.equal(guessed.reason, expired.reason);
});

// ---------------------------------------------------------------------------
// The doors
// ---------------------------------------------------------------------------

function formReq(url, fields) {
  const raw = new URLSearchParams(fields).toString();
  const r = { method: 'POST', url, headers: { 'content-type': 'application/x-www-form-urlencoded' } };
  r[Symbol.asyncIterator] = async function* () { yield Buffer.from(raw); };
  return r;
}

function res() {
  return {
    statusCode: 200, headers: {}, body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    getHeader(k) { return this.headers[k.toLowerCase()]; },
    writeHead(code, h) { this.statusCode = code; Object.assign(this.headers, h); return this; },
    end(b) { this.body = b || ''; return this; },
  };
}

test('the website form is rate limited, because each request sends an email', async () => {
  const w = { ...world(), rateLimitReset: async () => false };
  const r = res();
  await handlePlatform(formReq('/platform/forgot', { email: 'ann@bos.co' }), r, w);
  assert.equal(r.statusCode, 429);
  assert.equal(w.mail.length, 0);
});

test('the website flow works end to end', async () => {
  const w = { ...world(), rateLimitReset: async () => true };
  let r = res();
  await handlePlatform(formReq('/platform/forgot', { email: 'ann@bos.co' }), r, w);
  assert.equal(r.statusCode, 200);

  r = res();
  await handlePlatform(formReq('/platform/reset', { token: w.mail[0].token, password: 'new-password-123' }), r, w);
  assert.equal(r.statusCode, 200);
  assert.match(r.body, /Password changed/);
});

test('the app\'s JSON routes run the same flow', async () => {
  const w = { ...world(), rateLimitReset: async () => true };
  const jsonReq = (url, body) => {
    const r = { method: 'POST', url, headers: { 'content-type': 'application/json' } };
    r[Symbol.asyncIterator] = async function* () { yield Buffer.from(JSON.stringify(body)); };
    return r;
  };

  let r = res();
  await handlePlatform(jsonReq('/platform/api/forgot', { email: 'nobody@x.co' }), r, w);
  assert.equal(r.statusCode, 200);
  assert.equal(JSON.parse(r.body).message, REQUESTED, 'same answer for an unknown email');

  await handlePlatform(jsonReq('/platform/api/forgot', { email: 'ann@bos.co' }), res(), w);
  r = res();
  await handlePlatform(jsonReq('/platform/api/reset', { token: w.mail[0].token, password: 'new-password-123' }), r, w);
  assert.equal(r.statusCode, 200);
  assert.equal(JSON.parse(r.body).gym_accounts_updated, 1);
});

test('THE SIGN-IN PAGE LINKS TO IT, AND AN OWNER WITHOUT 2FA CAN SUBMIT IT', () => {
  // The code field was `required`, so an owner without two-factor could not
  // sign in without typing something meaningless into it.
  const views = readFileSync('platform/views.js', 'utf8');
  const login = views.slice(views.indexOf('export function loginPage'), views.indexOf('export function forgotPage'));
  assert.match(login, /href="\/platform\/forgot"/);
  const totp = login.slice(login.indexOf('name="totp"'), login.indexOf('</label>', login.indexOf('name="totp"')));
  assert.ok(!/required/.test(totp), 'the code field is optional');
});

test('the table exists in both schema files, with row level security', () => {
  for (const file of ['platform/schema.sql', 'platform/RUN-THIS.sql']) {
    const sql = readFileSync(file, 'utf8');
    assert.match(sql, /create table if not exists platform\.password_resets/);
    assert.match(sql, /alter table platform\.password_resets\s+enable row level security/);
  }
});
