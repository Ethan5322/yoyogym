// Platform sign-in lockout, and the find-gym rate limit.
//
// platform_users had failed_logins and locked_until from the first schema,
// commented "5 attempts -> 15 minute lock". Nothing read or wrote them. A gym
// owner signs in with a password alone, and that password reaches their gym
// and every member in it — guessable without limit through either door.
//
// And /platform/api/member/find-gym said "rate limited hard" above a call to a
// dependency that did not exist, made through `?.`, which turned "not wired"
// into "no limit" in silence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.PLATFORM_JWT_SECRET ||= 'test-only-platform-secret-distinct';

import { decideLogin, afterFailure, isLocked, MAX_FAILED_LOGINS, LOCK_MINUTES } from '../platform/login.js';
import { makeLimiter, resetLimits } from '../platform/ratelimit.js';
import { handlePlatform } from '../platform/router.js';

const NOW = new Date('2026-09-24T10:00:00Z');

/** A tiny in-memory platform_users, so the counter really accumulates. */
function accounts(user) {
  const row = { failed_logins: 0, locked_until: null, is_active: true, totp_enabled: false, ...user };
  const deps = {
    row,
    saves: 0,
    findUserByEmail: async (email) => (email === row.email ? { ...row } : null),
    verifyPassword: async (plain) => plain === 'correct-horse',
    verifySecondFactor: async (_u, code) => code === '123456',
    saveLoginState: async (_id, patch) => {
      deps.saves += 1;
      Object.assign(row, patch);
    },
  };
  return deps;
}

const OWNER = { id: 'o1', email: 'ann@bos.co', kind: 'gym_owner' };
const attempt = (deps, password, at = NOW, totp) => decideLogin(deps, { email: OWNER.email, password, totp }, at);

// ---------------------------------------------------------------------------
// The lock
// ---------------------------------------------------------------------------

test('FIVE WRONG PASSWORDS LOCK THE ACCOUNT', async () => {
  const deps = accounts(OWNER);

  for (let i = 1; i < MAX_FAILED_LOGINS; i++) {
    assert.equal((await attempt(deps, 'wrong')).outcome, 'invalid');
    assert.equal(deps.row.failed_logins, i);
  }

  assert.equal((await attempt(deps, 'wrong')).outcome, 'invalid');
  assert.ok(isLocked(deps.row, NOW), 'the fifth failure sets the lock');
});

test('THE RIGHT PASSWORD DURING THE LOCK IS STILL REFUSED', async () => {
  // Otherwise the lock only slows down the wrong guesses.
  const deps = accounts(OWNER);
  for (let i = 0; i < MAX_FAILED_LOGINS; i++) await attempt(deps, 'wrong');

  assert.equal((await attempt(deps, 'correct-horse')).outcome, 'locked');
});

test('a locked account does not even check the password', async () => {
  const deps = accounts({ ...OWNER, locked_until: new Date(NOW.getTime() + 60_000).toISOString() });
  let checked = false;
  deps.verifyPassword = async () => { checked = true; return true; };

  await attempt(deps, 'correct-horse');
  assert.equal(checked, false);
});

test('the lock expires after fifteen minutes, with a fresh five', async () => {
  const deps = accounts(OWNER);
  for (let i = 0; i < MAX_FAILED_LOGINS; i++) await attempt(deps, 'wrong');

  const later = new Date(NOW.getTime() + LOCK_MINUTES * 60_000 + 1000);
  assert.equal((await attempt(deps, 'correct-horse', later)).outcome, 'ok');
  assert.equal(deps.row.failed_logins, 0);
  assert.equal(deps.row.locked_until, null);
});

test('success clears earlier failures, so they do not add up across days', async () => {
  const deps = accounts(OWNER);
  await attempt(deps, 'wrong');
  await attempt(deps, 'wrong');
  await attempt(deps, 'correct-horse');

  assert.equal(deps.row.failed_logins, 0);
});

test('an ordinary successful sign-in writes nothing', async () => {
  const deps = accounts(OWNER);
  await attempt(deps, 'correct-horse');
  assert.equal(deps.saves, 0);
});

test('a wrong SECOND FACTOR counts as a failure too', async () => {
  // Otherwise 2FA codes could be guessed without limit once the password leaked.
  const deps = accounts({ ...OWNER, totp_enabled: true });
  await attempt(deps, 'correct-horse', NOW, '000000');
  assert.equal(deps.row.failed_logins, 1);
});

test('staff with the right password but no 2FA are not locked for it', async () => {
  // They are told to finish setup. Locking them would stop them doing so.
  const deps = accounts({ id: 's1', email: OWNER.email, kind: 'platform_staff' });
  for (let i = 0; i < MAX_FAILED_LOGINS + 1; i++) {
    assert.equal((await attempt(deps, 'correct-horse')).outcome, 'needs2fa');
  }
  assert.equal(deps.row.failed_logins, 0);
});

test('an unknown email writes nothing and says the generic thing', async () => {
  const deps = accounts(OWNER);
  const result = await decideLogin(deps, { email: 'nobody@x.co', password: 'x' }, NOW);
  assert.equal(result.outcome, 'invalid');
  assert.equal(deps.saves, 0);
});

test('afterFailure matches the gym side: the counter resets as the lock is set', () => {
  const patch = afterFailure({ failed_logins: MAX_FAILED_LOGINS - 1 }, NOW);
  assert.equal(patch.failed_logins, 0);
  assert.equal(new Date(patch.locked_until).getTime(), NOW.getTime() + LOCK_MINUTES * 60_000);
});

// ---------------------------------------------------------------------------
// Both doors use it
// ---------------------------------------------------------------------------

test('BOTH DOORS DECIDE THROUGH THE SAME FUNCTION', () => {
  // Two copies of the rule is how the lockout came to exist on neither.
  for (const file of ['platform/router.js', 'platform/api.js']) {
    const source = readFileSync(file, 'utf8');
    assert.match(source, /decideLogin\(deps,/, `${file} must call decideLogin`);
    assert.ok(!/deps\.verifyPassword\(/.test(source), `${file} must not check passwords itself`);
  }
});

// ---------------------------------------------------------------------------
// find-gym
// ---------------------------------------------------------------------------

function jsonReq(url, body, ip = '198.51.100.7') {
  const raw = JSON.stringify(body);
  const r = { method: 'POST', url, headers: { 'content-type': 'application/json', 'x-forwarded-for': ip } };
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

test('FIND-GYM IS ACTUALLY LIMITED', async () => {
  resetLimits();
  let lookups = 0;
  const deps = {
    audit: async () => {},
    rateLimitFindGym: makeLimiter({ key: 't-find', limit: 5, windowMs: 60_000, env: {} }),
    findGymsForMember: async () => { lookups += 1; return []; },
  };

  const statuses = [];
  for (let i = 0; i < 7; i++) {
    const r = res();
    await handlePlatform(jsonReq('/platform/api/member/find-gym', { membership_number: `GYM-2026-00000${i}`, phone: '0821234567' }), r, deps);
    statuses.push(r.statusCode);
  }

  assert.deepEqual(statuses, [404, 404, 404, 404, 404, 429, 429]);
  assert.equal(lookups, 5, 'a refused request never reaches the directory');
});

test('the limit is per address, so one abuser does not lock out everybody', async () => {
  resetLimits();
  const limit = makeLimiter({ key: 't-ip', limit: 1, windowMs: 60_000, env: {} });
  const at = (ip) => ({ headers: { 'x-forwarded-for': ip } });

  assert.equal(await limit(at('203.0.113.1')), true);
  assert.equal(await limit(at('203.0.113.1')), false);
  assert.equal(await limit(at('203.0.113.2')), true);
});

test('A MISSING LIMITER IS A CRASH, NOT AN OPEN DOOR', () => {
  // `deps.rateLimitFindGym?.(req)` is what hid this for a whole build.
  const source = readFileSync('platform/api.js', 'utf8');
  assert.ok(!/rateLimitFindGym\?\./.test(source));
});

test('the real dependency keeps its count across requests', () => {
  // platformDeps() runs per request; a limiter built inside it would reset
  // every time.
  const source = readFileSync('platform/deps.js', 'utf8');
  const factory = source.indexOf('export function platformDeps');
  const limiter = source.indexOf('const findGymLimiter = makeLimiter');
  assert.ok(limiter > -1 && limiter < factory, 'built once, at module level');
});

// ---------------------------------------------------------------------------
// The security screen
// ---------------------------------------------------------------------------

import { findAlerts, ALERTS } from '../platform/alerts.js';

test('GUESSING THAT CONTINUES INTO THE LOCK STILL RAISES THE ALERT', () => {
  // Two failures, then attempts the lock refused. Counting only "failed",
  // the alert went quiet at exactly the moment the guessing was confirmed.
  const now = new Date('2026-09-24T10:00:00Z');
  const entry = (action) => ({ action, created_at: now.toISOString(), detail: { email: 'ann@bos.co' } });
  const entries = [
    entry('platform.login.failed'),
    entry('platform.login.failed'),
    entry('platform.login.locked'),
    entry('platform.login.locked'),
    entry('platform.login.locked'),
  ];

  const alert = findAlerts(entries, { now }).find((a) => a.code === ALERTS.BRUTE_FORCE);
  assert.ok(alert, 'five attempts on one account is the threshold');
  assert.equal(alert.count, 5);
});

test('both doors record WHICH account a locked attempt was for', () => {
  for (const file of ['platform/router.js', 'platform/api.js']) {
    const source = readFileSync(file, 'utf8');
    const at = source.indexOf("action: 'platform.login.locked'");
    assert.ok(at > -1, `${file} audits the lock`);
    assert.match(source.slice(at, at + 200), /email:/, `${file} names the account`);
  }
});
