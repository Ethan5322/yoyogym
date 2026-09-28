// "Stay signed in until you sign out" (CLAUDE.md §38.1 Q2, Q3): long sessions
// for the app, ended by raising the account's session_version. Short sessions
// — every session before this — are untouched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET ||= 'test-secret-for-sessions';
const { checkLongSession, signOutEverywhere, withSessionVersion, SIGNED_OUT } = await import('../server/lib/sessions.js');
const { signMemberToken } = await import('../server/lib/memberauth.js');
const { signToken } = await import('../server/lib/auth.js');

/** An in-memory `members` / `admin_users` table behind a supabase-js-shaped API. */
function fakeDb(tables, { failReads = false } = {}) {
  const reads = [];
  return {
    reads,
    from(table) {
      let id;
      let update = null;
      const q = {
        select() { return q; },
        update(u) { update = u; return q; },
        eq(col, val) {
          id = val;
          if (update) {
            const row = tables[table].find((r) => r.id === id);
            Object.assign(row, update);
            return Promise.resolve({ error: null });
          }
          return q;
        },
        async maybeSingle() {
          reads.push(table);
          if (failReads) return { data: null, error: { message: 'down' } };
          return { data: tables[table].find((r) => r.id === id) || null, error: null };
        },
      };
      return q;
    },
  };
}

function res() {
  return { status: 0, body: null };
}
const json = (r, status, body) => { r.status = status; r.body = body; };
const req = (token) => ({ headers: token ? { authorization: `Bearer ${token}` } : {} });

const MEMBER = { id: 'm1', membership_number: 'GYM-2026-000123', session_version: 0 };
const OWNER = { id: 'a1', username: 'owner', role: 'owner', full_name: 'Owner', session_version: 2, is_active: true };

test('A SHORT SESSION IS CHECKED EXACTLY AS BEFORE — NO DATABASE READ', async () => {
  const db = fakeDb({ members: [{ ...MEMBER }] });
  const token = signMemberToken(MEMBER);
  assert.equal(jwt.decode(token).sv, undefined, 'no session version in a short token');
  const r = res();
  assert.equal(await checkLongSession(req(token), r, 'member', json, db), true);
  assert.deepEqual(db.reads, []);
  const hours = (jwt.decode(token).exp - jwt.decode(token).iat) / 3600;
  assert.equal(hours, 12, 'members still get 12 hours outside the app');
  assert.equal((jwt.decode(signToken(OWNER)).exp - jwt.decode(signToken(OWNER)).iat) / 3600, 8, 'staff still 8');
});

test('THE APP\'S LONG SESSION LASTS UNTIL SIGN-OUT, AND CARRIES ITS VERSION', () => {
  const t = jwt.decode(signMemberToken({ ...MEMBER, session_version: 3 }, { remember: true }));
  assert.equal(t.sv, 3);
  assert.ok(t.exp - t.iat > 365 * 24 * 3600 * 5, 'years, not hours');
  const a = jwt.decode(signToken(OWNER, { remember: true }));
  assert.equal(a.sv, 2);
  assert.equal(a.role, 'owner', 'the role and everything else are unchanged');
});

test('A LONG SESSION PASSES WHILE ITS VERSION MATCHES', async () => {
  const db = fakeDb({ members: [{ ...MEMBER }] });
  const r = res();
  assert.equal(await checkLongSession(req(signMemberToken(MEMBER, { remember: true })), r, 'member', json, db), true);
  assert.equal(r.status, 0);
});

test('"SIGN OUT EVERYWHERE" ENDS EVERY LONG SESSION AT ONCE', async () => {
  const tables = { members: [{ ...MEMBER }] };
  const db = fakeDb(tables);
  const token = signMemberToken(MEMBER, { remember: true });
  assert.deepEqual(await signOutEverywhere(db, 'member', 'm1'), { ok: true });
  assert.equal(tables.members[0].session_version, 1);

  const r = res();
  assert.equal(await checkLongSession(req(token), r, 'member', json, db), false);
  assert.equal(r.status, 401);
  assert.deepEqual(r.body, { error: SIGNED_OUT, signed_out: true });

  // Signing in again issues a session at the new version, which works.
  const fresh = signMemberToken(tables.members[0], { remember: true });
  assert.equal(await checkLongSession(req(fresh), res(), 'member', json, db), true);
});

test('A DISABLED STAFF ACCOUNT LOSES ITS LONG SESSION', async () => {
  const tables = { admin_users: [{ ...OWNER, is_active: false }] };
  const r = res();
  assert.equal(await checkLongSession(req(signToken(OWNER, { remember: true })), r, 'admin', json, fakeDb(tables)), false);
  assert.equal(r.status, 401);
});

test('an account that no longer exists loses its long session', async () => {
  const r = res();
  assert.equal(await checkLongSession(req(signMemberToken(MEMBER, { remember: true })), r, 'member', json, fakeDb({ members: [] })), false);
});

test('A DATABASE HICCUP NEVER SIGNS ANYONE OUT', async () => {
  const db = fakeDb({ members: [{ ...MEMBER }] }, { failReads: true });
  assert.equal(await checkLongSession(req(signMemberToken(MEMBER, { remember: true })), res(), 'member', json, db), true);
});

test('no token, or a bad one, is left to the handler to refuse as always', async () => {
  const db = fakeDb({ members: [] });
  assert.equal(await checkLongSession(req(null), res(), 'member', json, db), true);
  assert.equal(await checkLongSession(req('not-a-token'), res(), 'member', json, db), true);
  assert.deepEqual(db.reads, []);
});

test('a face sign-in reads the session version only when asked to stay signed in', async () => {
  const db = fakeDb({ members: [{ ...MEMBER, session_version: 4 }] });
  assert.equal((await withSessionVersion(db, 'members', { id: 'm1' }, false)).session_version, undefined);
  assert.deepEqual(db.reads, []);
  assert.equal((await withSessionVersion(db, 'members', { id: 'm1' }, true)).session_version, 4);
});

test('THE CHECK SITS IN ALL THREE ROUTERS, AND RESETS AND DISABLES SIGN OUT', () => {
  for (const [file, kind] of [['api/member/[...path].js', 'member'], ['api/admin/[...path].js', 'admin'], ['api/auth/[...path].js', 'admin']]) {
    assert.match(readFileSync(file, 'utf8'), new RegExp(`await checkLongSession\\(req, res, '${kind}', json\\)`), file);
  }
  const staff = readFileSync('server/handlers/admin/staff.js', 'utf8');
  assert.match(staff, /Boolean\(b\.password\) \|\| b\.is_active === false \|\| b\.sign_out_everywhere === true/);
  assert.match(readFileSync('server/handlers/admin/member-action.js', 'utf8'), /action === 'sign_out_everywhere'/);
});

test('ONLY THE APP ASKS FOR A LONG SESSION', () => {
  assert.match(readFileSync('apps/mobile/www/member.js', 'utf8'), /phone: ph, remember: true/);
  const login = readFileSync('src/pages/admin/Login.jsx', 'utf8');
  assert.match(login, /remember: Boolean\(app\)/, 'the web sign-in only when opened from the app');
  assert.ok(!/remember: true/.test(readFileSync('src/pages/MemberPortal.jsx', 'utf8')), 'the website member portal keeps 12 hours');
});
