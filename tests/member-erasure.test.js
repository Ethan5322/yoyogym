// "Delete my account", finished within 30 days (CLAUDE.md §46.1 Q3): the
// member asks, the date is kept, the gym may erase sooner, and on day 30 the
// morning job erases it — payments kept without the person, their messages
// and the message log gone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.JWT_SECRET ||= 'test-only-gym-secret';

const { fakeDb } = await import('./fake-db.js');
const { runWithGym } = await import('../server/lib/tenancy.js');
const { signMemberToken } = await import('../server/lib/memberauth.js');
const { ALL_SERVICES } = await import('../shared/features.js');
const { eraseMember, deleteBy, DELETION_DAYS } = await import('../server/lib/member-erasure.js');
const { run: eraseRequested } = await import('../server/handlers/cron/erase-requested.js');
const { default: requestDeletion } = await import('../server/handlers/member/request-deletion.js');

const DAY = 24 * 60 * 60 * 1000;

function gym() {
  return fakeDb({
    members: [
      { id: 'm1', full_name: 'Thandi Mokoena', email: null, membership_number: 'GYM-2026-000001', phone: '0821234567', data_deletion_requested: false },
      { id: 'm2', full_name: 'Sipho Dlamini', email: null, membership_number: 'GYM-2026-000002', phone: '0831234567', data_deletion_requested: false },
    ],
    payments: [
      { id: 'p1', member_id: 'm1', amount: 300, status: 'paid' },
      { id: 'p2', member_id: 'm2', amount: 300, status: 'paid' },
    ],
    notifications_log: [
      { id: 'n1', member_id: 'm1', recipient: 'thandi@example.com' },
      { id: 'n2', member_id: 'm2', recipient: 'sipho@example.com' },
    ],
    admin_inbox: [
      { id: 'i1', member_id: 'm1', body: 'Please call me' },
      { id: 'i2', member_id: 'm2', body: 'Hello' },
    ],
    audit_log: [],
  });
}

const inGym = (db, fn) => runWithGym({ client: db, features: ALL_SERVICES, gym: { slug: null } }, fn);

test('erasing a member keeps the payment without the person, and removes their messages and message log', async () => {
  const db = gym();
  const result = await inGym(db, () => eraseMember(db, 'm1'));
  assert.equal(result.ok, true);
  assert.deepEqual(db.tables.members.map((m) => m.id), ['m2']);
  // The payment is still there for the books — with no link to Thandi.
  assert.deepEqual(db.tables.payments.find((p) => p.id === 'p1'), { id: 'p1', member_id: null, amount: 300, status: 'paid' });
  assert.equal(db.tables.payments.find((p) => p.id === 'p2').member_id, 'm2', 'nobody else is touched');
  assert.deepEqual(db.tables.notifications_log.map((n) => n.id), ['n2']);
  assert.deepEqual(db.tables.admin_inbox.map((n) => n.id), ['i2']);
});

test('a member who is already gone is reported as not found, and nothing else changes', async () => {
  const db = gym();
  const result = await inGym(db, () => eraseMember(db, 'nobody'));
  assert.equal(result.ok, false);
  assert.equal(result.notFound, true);
  assert.equal(db.tables.members.length, 2);
});

test('asking to delete keeps the FIRST date, and says when it will be done', async () => {
  const db = gym();
  const call = async () => {
    const res = {
      statusCode: 200, body: '',
      status(c) { this.statusCode = c; return this; },
      setHeader() { return this; },
      end(b) { this.body = b || ''; return this; },
    };
    const req = { method: 'POST', url: '/', headers: { authorization: `Bearer ${signMemberToken({ id: 'm1', membership_number: 'GYM-2026-000001' })}` }, body: {} };
    await inGym(db, () => requestDeletion(req, res));
    return { status: res.statusCode, json: JSON.parse(res.body) };
  };
  const first = await call();
  assert.equal(first.status, 200);
  const m1 = db.tables.members.find((m) => m.id === 'm1');
  assert.equal(m1.data_deletion_requested, true);
  const askedAt = m1.data_deletion_requested_at;
  assert.ok(askedAt);
  assert.equal(first.json.delete_by, deleteBy(askedAt).toISOString().slice(0, 10));
  assert.match(first.json.message, /will be deleted by/);

  // Asking again does not restart the 30 days.
  m1.data_deletion_requested_at = new Date(Date.now() - 5 * DAY).toISOString();
  const again = await call();
  assert.equal(db.tables.members.find((m) => m.id === 'm1').data_deletion_requested_at, m1.data_deletion_requested_at);
  assert.equal(again.json.delete_by, deleteBy(m1.data_deletion_requested_at).toISOString().slice(0, 10));
});

test('on day 30 the morning job erases the account — and not a day before', async () => {
  const db = gym();
  const now = new Date('2026-11-01T06:00:00Z');
  Object.assign(db.tables.members[0], { data_deletion_requested: true, data_deletion_requested_at: new Date(now - DELETION_DAYS * DAY - 1000).toISOString() });
  Object.assign(db.tables.members[1], { data_deletion_requested: true, data_deletion_requested_at: new Date(now - (DELETION_DAYS - 1) * DAY).toISOString() });
  const result = await inGym(db, () => eraseRequested(db, now));
  assert.deepEqual(result, { due: 1, erased: 1, failed: 0 });
  assert.deepEqual(db.tables.members.map((m) => m.id), ['m2'], 'the one asked 29 days ago waits');
  assert.equal(db.tables.audit_log.length, 1);
  assert.equal(db.tables.audit_log[0].action, 'member.erased_on_request');
});

test('the morning job runs the erasure, and the owner\'s button uses the same one', () => {
  assert.match(readFileSync('server/handlers/cron/daily.js', 'utf8'), /\['erase_requested', eraseRequested\]/);
  assert.match(readFileSync('server/handlers/cron/erase-requested.js', 'utf8'), /eraseMember\(supabase, m\.id, \{ confirm: true \}\)/);
  assert.match(readFileSync('server/handlers/admin/member.js', 'utf8'), /eraseMember\(supabase, id, \{ confirm: 'if-asked' \}\)/);
});

test('new gyms get the date column, and the health check asks for it', () => {
  assert.match(readFileSync('db/schema.sql', 'utf8'), /data_deletion_requested_at timestamptz/);
  assert.match(readFileSync('db/schema.sql.js', 'utf8'), /data_deletion_requested_at timestamptz/);
  assert.match(readFileSync('server/handlers/public/health.js', 'utf8'), /data_deletion_requested_at: '2026-09-30-member-deletion-date\.sql'/);
});
