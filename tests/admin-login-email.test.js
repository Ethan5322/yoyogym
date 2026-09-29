// The gym admin sign-in accepts the account's EMAIL as well as its username
// (CLAUDE.md §36.1 Q12, approved 2026-09-28). The username path is unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// The auth library refuses to load without a signing secret; any test value will do.
process.env.JWT_SECRET ||= 'test-secret-for-admin-login-email';
const { findAdminAccount } = await import('../server/handlers/auth/login.js');

/** A tiny stand-in for supabase-js over an in-memory admin_users table. */
function fakeDb(rows) {
  const calls = [];
  return {
    calls,
    from(table) {
      assert.equal(table, 'admin_users');
      const filters = [];
      const q = {
        select(cols) { q.cols = cols; return q; },
        eq(col, val) { filters.push((r) => r[col] === val); calls.push(['eq', col, val]); return q; },
        not(col, op, val) { assert.equal(op, 'is'); assert.equal(val, null); filters.push((r) => r[col] != null); calls.push(['not', col]); return q; },
        async maybeSingle() {
          const hit = rows.filter((r) => filters.every((f) => f(r)));
          if (hit.length > 1) return { data: null, error: { message: 'multiple rows' } };
          return { data: hit[0] || null, error: null };
        },
        then(resolve) { resolve({ data: rows.filter((r) => filters.every((f) => f(r))), error: null }); },
      };
      return q;
    },
  };
}

const KOM = [
  { id: 1, username: 'owner', email: 'Owner.Kom@Gmail.com', role: 'owner' },
  { id: 2, username: 'Merit', email: 'merit@gmail.com', role: 'manager' },
  { id: 3, username: 'desk1', email: 'front@kom.co.za', role: 'reception' },
  { id: 4, username: 'desk2', email: 'front@kom.co.za', role: 'reception' },
  { id: 5, username: 'trainer9', email: null, role: 'trainer' },
];

test('A USERNAME SIGNS IN EXACTLY AS BEFORE', async () => {
  const db = fakeDb(KOM);
  const { user } = await findAdminAccount(db, 'owner');
  assert.equal(user.id, 1);
  assert.deepEqual(db.calls, [['eq', 'username', 'owner']], 'one lookup, by username — nothing else');
});

test('THE ACCOUNT\'S EMAIL SIGNS IN TOO — ANY CAPITALS, ANY SPACES', async () => {
  assert.equal((await findAdminAccount(fakeDb(KOM), 'owner.kom@gmail.com')).user.id, 1);
  assert.equal((await findAdminAccount(fakeDb(KOM), '  OWNER.KOM@GMAIL.COM ')).user.id, 1);
  assert.equal((await findAdminAccount(fakeDb(KOM), 'merit@gmail.com')).user.role, 'manager');
});

test('a username still wins over an email that happens to match another account', async () => {
  const rows = [...KOM, { id: 6, username: 'merit@gmail.com', email: 'x@y.z', role: 'trainer' }];
  assert.equal((await findAdminAccount(fakeDb(rows), 'merit@gmail.com')).user.id, 6);
});

test('TWO ACCOUNTS SHARING AN EMAIL MUST USE THEIR USERNAMES', async () => {
  // Guessing between them would sign someone into the wrong account.
  assert.equal((await findAdminAccount(fakeDb(KOM), 'front@kom.co.za')).user, null);
  assert.equal((await findAdminAccount(fakeDb(KOM), 'desk2')).user.id, 4);
});

test('A PATTERN CANNOT WIDEN THE MATCH', async () => {
  for (const probe of ['%@%', '_%@gmail.com', '*@gmail.com', '@gmail.com', 'gmail.com']) {
    assert.equal((await findAdminAccount(fakeDb(KOM), probe)).user, null, probe);
  }
});

test('nothing that is neither a username nor an email reaches the email search', async () => {
  const db = fakeDb(KOM);
  assert.equal((await findAdminAccount(db, 'nobody')).user, null);
  assert.ok(!db.calls.some((c) => c[0] === 'not'), 'no second query without an @');
});

test('THE LOCKOUT STILL COUNTS: WRONG PASSWORDS AGAINST AN EMAIL HIT THE SAME ACCOUNT', async () => {
  // The handler locks whatever account findAdminAccount returns, by its id —
  // so five wrong tries by email lock the owner exactly as five by username.
  const { readFileSync } = await import('node:fs');
  const handler = readFileSync('server/handlers/auth/login.js', 'utf8');
  // In attemptLogin since §43.1 Q2, shared with the owners' email sign-in.
  assert.match(handler, /const \{ user, error \} = await findAdminAccount\(supabase, identifier\);/);
  assert.match(handler, /\.update\(update\)\.eq\('id', user\.id\)/, 'lockout is by account id');
  assert.match(handler, /Invalid username or password/, 'the same generic refusal either way');
});
