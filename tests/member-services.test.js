// The four member services (CLAUDE.md §41.1 Q3), end to end through their
// handlers against an in-memory database: pause, rewards, challenges, family.
// Every figure is counted from what happened — check-ins and claims.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.JWT_SECRET ||= 'test-only-gym-secret';

const { fakeDb } = await import('./fake-db.js');
const { runWithGym } = await import('../server/lib/tenancy.js');
const { signMemberToken } = await import('../server/lib/memberauth.js');
const { signToken } = await import('../server/lib/auth.js');
const { ALL_SERVICES, FEATURES, OWNER_SWITCHABLE, SERVICE_INFO, MEMBER_ROUTE_FEATURES, ROUTE_FEATURES } = await import('../shared/features.js');
const { PLANS } = await import('../platform/plans.js');
const { cleanPauseRules, pauseProblem, pausePeriod, unusedDays, addDays, ymd } = await import('../server/lib/pauses.js');
const { rewardsSummary, streakWeeks, challengeProgress, boardName, leaderboard, cleanRewardRules } = await import('../server/lib/loyalty.js');
const { addProblem, cleanGroupPricing, discountFor } = await import('../server/lib/groups.js');
const { default: memberPause } = await import('../server/handlers/member/pause.js');
const { default: memberRewards } = await import('../server/handlers/member/rewards.js');
const { default: memberChallenges } = await import('../server/handlers/member/challenges.js');
const { default: memberFamily } = await import('../server/handlers/member/family.js');
const { default: adminPauses } = await import('../server/handlers/admin/pauses.js');
const { default: adminRewards } = await import('../server/handlers/admin/rewards.js');
const { default: adminGroups } = await import('../server/handlers/admin/member-groups.js');
const { run: resumePauses } = await import('../server/handlers/cron/resume-pauses.js');

const TODAY = ymd(new Date());
const MEMBER = { id: 'm1', membership_number: 'GYM-2026-000001' };
const memberToken = (m = MEMBER) => signMemberToken(m);
const staffToken = (role = 'owner') => signToken({ id: 'a1', username: 'owner', role, full_name: 'Owner' });

function req({ method = 'GET', url = '/', token, body = null }) {
  // Vercel hands handlers the body already parsed, as req.body.
  return { method, url, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body || {} };
}
function res() {
  return {
    statusCode: 200, headers: {}, body: '',
    status(c) { this.statusCode = c; return this; },
    setHeader(k, v) { this.headers[k] = v; return this; }, getHeader(k) { return this.headers[k]; },
    writeHead(c, h) { this.statusCode = c; Object.assign(this.headers, h || {}); return this; },
    end(b) { this.body = b || ''; return this; },
    get json() { return this.body ? JSON.parse(this.body) : null; },
  };
}
async function call(handler, db, opts) {
  const r = res();
  await runWithGym({ client: db, features: ALL_SERVICES, gym: { slug: 'test' } }, () => handler(req(opts), r));
  return r;
}

function gymWith(extra = {}) {
  return fakeDb({
    members: [{ id: 'm1', full_name: 'Thandi Mokoena', membership_number: 'GYM-2026-000001', status: 'active' }],
    memberships: [{ id: 'ms1', member_id: 'm1', state: 'active', end_date: '2026-12-31', created_at: '2026-01-01' }],
    settings: [],
    membership_pauses: [],
    checkins: [],
    rewards: [],
    reward_claims: [],
    challenges: [],
    challenge_entries: [],
    member_groups: [],
    member_group_links: [],
    ...extra,
  });
}

// ---------------------------------------------------------------------------
// The catalogue and the plans (Q3, Q4)
// ---------------------------------------------------------------------------

test('Q3 the four services exist everywhere a service must: named, switchable, routed', () => {
  for (const f of [FEATURES.FREEZE, FEATURES.REWARDS, FEATURES.FAMILY, FEATURES.CHALLENGES]) {
    assert.ok(SERVICE_INFO[f].label && SERVICE_INFO[f].forMembers, `${f} is named`);
    assert.ok(OWNER_SWITCHABLE.includes(f), `${f} can be switched off by an owner`);
    assert.ok(Object.values(MEMBER_ROUTE_FEATURES).includes(f), `${f} has a member route`);
    assert.ok(Object.values(ROUTE_FEATURES).includes(f), `${f} has an owner screen`);
  }
});

test('Q4 where each starts: Basic pause; Medium + rewards and family; Prime + challenges', () => {
  const by = Object.fromEntries(PLANS.map((p) => [p.key, p.features]));
  assert.ok(by.basic.includes('freeze') && !by.basic.includes('rewards'));
  assert.ok(['freeze', 'rewards', 'family'].every((f) => by.medium.includes(f)) && !by.medium.includes('challenges'));
  assert.ok(['freeze', 'rewards', 'family', 'challenges'].every((f) => by.prime.includes(f)));
  const seed = readFileSync('platform/seed.sql', 'utf8');
  assert.match(seed, /"challenges"\]'::jsonb/);
  assert.ok(!/features = excluded\.features/.test(seed), 're-running the seed never overwrites the plans the platform owner set');
});

test('the gym schema has the six new tables, with row-level security on', () => {
  const schema = readFileSync('db/schema.sql', 'utf8');
  for (const t of ['membership_pauses', 'rewards', 'reward_claims', 'challenges', 'challenge_entries', 'member_groups', 'member_group_links']) {
    assert.match(schema, new RegExp(`create table if not exists gym\\.${t} \\(`));
    assert.match(schema, new RegExp(`'${t}'`), `${t} is in the RLS list`);
  }
});

// ---------------------------------------------------------------------------
// Pause — the rules
// ---------------------------------------------------------------------------

test('pause rules are cleaned: whole days, shortest ≤ longest, a fee never negative', () => {
  assert.deepEqual(cleanPauseRules({ min_days: '40', max_days: '10', max_per_year: 99, fee: -5 }), { min_days: 40, max_days: 40, max_per_year: 12, fee: 0 });
});

test('a pause must be within the rules, and not a third one in a year', () => {
  const rules = cleanPauseRules({});
  const active = { status: 'active' };
  assert.match(pauseProblem({ days: 3, rules, member: active, pauses: [], today: TODAY }), /between 7 and 30/);
  assert.equal(pauseProblem({ days: 14, rules, member: active, pauses: [], today: TODAY }), null);
  const two = [{ starts_on: addDays(TODAY, -100), ends_on: addDays(TODAY, -90), resumed_at: 'x' }, { starts_on: addDays(TODAY, -50), ends_on: addDays(TODAY, -40), resumed_at: 'x' }];
  assert.match(pauseProblem({ days: 14, rules, member: active, pauses: two, today: TODAY }), /used your 2 pauses/);
  assert.match(pauseProblem({ days: 14, rules, member: { status: 'lapsed' }, pauses: [], today: TODAY }), /Only an active/);
});

test('ending early gives back exactly the days not used', () => {
  const p = pausePeriod('2026-10-01', 14);
  assert.equal(p.ends_on, '2026-10-14');
  assert.equal(unusedDays(p, '2026-10-01'), 14, 'back the same day: nothing used');
  assert.equal(unusedDays(p, '2026-10-08'), 7);
  assert.equal(unusedDays(p, '2026-10-20'), 0);
});

// ---------------------------------------------------------------------------
// Pause — end to end
// ---------------------------------------------------------------------------

test('A MEMBER PAUSES FROM THE APP: status paused, end date moved on, and they cannot check in', async () => {
  const db = gymWith();
  const r = await call(memberPause, db, { method: 'POST', token: memberToken(), body: { days: 14 } });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(db.tables.members[0].status, 'frozen');
  assert.equal(db.tables.memberships[0].end_date, '2027-01-14', '31 Dec + 14 days');
  assert.equal(db.tables.membership_pauses.length, 1);
  assert.equal(db.tables.membership_pauses[0].created_by, 'member');
  // Check-in already refuses anyone not active.
  assert.match(readFileSync('server/handlers/member/checkin.js', 'utf8'), /if \(member\.status !== 'active'\)/);
});

test('coming back early: active again, and the unused days come off the end date', async () => {
  const db = gymWith();
  await call(memberPause, db, { method: 'POST', token: memberToken(), body: { days: 14 } });
  const r = await call(memberPause, db, { method: 'POST', token: memberToken(), body: { action: 'resume' } });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(db.tables.members[0].status, 'active');
  assert.equal(db.tables.memberships[0].end_date, '2026-12-31', 'back the same day: all 14 days returned');
  assert.ok(db.tables.membership_pauses[0].resumed_at);
});

test('a pause outside the owner\'s rules is refused, with the reason', async () => {
  const db = gymWith({ settings: [{ key: 'pause_rules', value: { min_days: 7, max_days: 10, max_per_year: 1 } }] });
  const r = await call(memberPause, db, { method: 'POST', token: memberToken(), body: { days: 30 } });
  assert.equal(r.statusCode, 400);
  assert.match(r.json.error, /between 7 and 10/);
  assert.equal(db.tables.members[0].status, 'active', 'nothing changed');
});

test('THE MORNING JOB ENDS A PAUSE ON ITS LAST DAY — only for a member still paused', async () => {
  const db = gymWith({
    members: [
      { id: 'm1', full_name: 'A', status: 'frozen' },
      { id: 'm2', full_name: 'B', status: 'suspended' },
    ],
    membership_pauses: [
      { id: 'p1', member_id: 'm1', starts_on: addDays(TODAY, -15), ends_on: addDays(TODAY, -1), days: 15, resumed_at: null },
      { id: 'p2', member_id: 'm2', starts_on: addDays(TODAY, -15), ends_on: addDays(TODAY, -1), days: 15, resumed_at: null },
    ],
  });
  const out = await resumePauses(db, TODAY);
  assert.deepEqual(out, { due: 2, resumed: 1 });
  assert.equal(db.tables.members[0].status, 'active');
  assert.equal(db.tables.members[1].status, 'suspended', 'suspended for another reason: left as staff set it');
  assert.match(readFileSync('server/handlers/cron/daily.js', 'utf8'), /\['resume_pauses', resumePauses\]/);
});

test('staff can pause and end a pause from the member\'s page', async () => {
  const db = gymWith();
  const p = await call(adminPauses, db, { method: 'POST', url: '/api/admin/pauses', token: staffToken('reception'), body: { member_id: 'm1', days: 60 } });
  assert.equal(p.statusCode, 200, p.body);
  assert.equal(db.tables.membership_pauses[0].created_by, 'staff');
  const e = await call(adminPauses, db, { method: 'POST', url: '/api/admin/pauses', token: staffToken('reception'), body: { action: 'end', pause_id: db.tables.membership_pauses[0].id } });
  assert.equal(e.statusCode, 200);
  assert.equal(db.tables.members[0].status, 'active');
});

// ---------------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------------

test('points are check-ins × points per visit, minus claims — and never below zero', () => {
  const visits = Array.from({ length: 5 }, (_, i) => `2026-09-${10 + i}T08:00:00Z`);
  const s = rewardsSummary({ visits, claims: [{ points: 20, status: 'given' }, { points: 30, status: 'cancelled' }], rules: cleanRewardRules({}) });
  assert.equal(s.earned, 50);
  assert.equal(s.spent, 20, 'a cancelled claim costs nothing');
  assert.equal(s.balance, 30);
  assert.equal(rewardsSummary({ visits: [], claims: [{ points: 100, status: 'given' }] }).balance, 0);
});

test('a streak counts whole weeks at the target, and this week only breaks it once it is over', () => {
  const now = new Date('2026-09-29T12:00:00Z'); // a Tuesday
  const visits = ['2026-09-22T08:00:00Z', '2026-09-24T08:00:00Z', '2026-09-15T08:00:00Z', '2026-09-17T08:00:00Z'];
  assert.equal(streakWeeks(visits, 2, now), 2, 'no visit yet this week, and the streak stands');
  assert.equal(streakWeeks(visits, 3, now), 0);
});

test('A MEMBER CLAIMS A REWARD WITH POINTS THEY EARNED — and cannot with points they did not', async () => {
  const visits = Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, member_id: 'm1', checked_in_at: `2026-09-${String(i + 1).padStart(2, '0')}T08:00:00Z` }));
  const db = gymWith({
    checkins: visits,
    rewards: [{ id: 'r1', name: 'Free shake', points: 100, is_enabled: true }, { id: 'r2', name: 'PT session', points: 500, is_enabled: true }],
  });
  const view = await call(memberRewards, db, { token: memberToken() });
  assert.equal(view.json.balance, 120);
  assert.deepEqual(view.json.rewards.map((r) => r.can_claim), [true, false]);

  const ok = await call(memberRewards, db, { method: 'POST', token: memberToken(), body: { reward_id: 'r1' } });
  assert.equal(ok.statusCode, 200, ok.body);
  // 'pending' is the column's default in the real database (db/schema.sql);
  // the in-memory stand-in does not apply defaults.
  assert.equal(db.tables.reward_claims.length, 1);
  assert.equal(db.tables.reward_claims[0].status ?? 'pending', 'pending');
  assert.match(readFileSync('db/schema.sql', 'utf8'), /status\s+text not null default 'pending',\s+-- pending \| given \| cancelled/);

  const refused = await call(memberRewards, db, { method: 'POST', token: memberToken(), body: { reward_id: 'r2' } });
  assert.equal(refused.statusCode, 400);
  assert.match(refused.json.error, /more points/);
});

test('the desk marks a claim given, once', async () => {
  const db = gymWith({ reward_claims: [{ id: 'k1', member_id: 'm1', reward_name: 'Free shake', points: 100, status: 'pending' }] });
  const r = await call(adminRewards, db, { method: 'POST', url: '/api/admin/rewards', token: staffToken('reception'), body: { action: 'claim', id: 'k1', status: 'given' } });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(db.tables.reward_claims[0].status, 'given');
  const again = await call(adminRewards, db, { method: 'POST', url: '/api/admin/rewards', token: staffToken('reception'), body: { action: 'claim', id: 'k1', status: 'cancelled' } });
  assert.equal(again.statusCode, 400, 'already dealt with');
});

test('reception hands rewards over but cannot change what rewards exist', async () => {
  const db = gymWith();
  const r = await call(adminRewards, db, { method: 'POST', url: '/api/admin/rewards', token: staffToken('reception'), body: { name: 'Towel', points: 50 } });
  assert.equal(r.statusCode, 400);
  assert.equal(db.tables.rewards.length, 0);
  const owner = await call(adminRewards, db, { method: 'POST', url: '/api/admin/rewards', token: staffToken('owner'), body: { name: 'Towel', points: 50 } });
  assert.equal(owner.statusCode, 200);
});

// ---------------------------------------------------------------------------
// Challenges
// ---------------------------------------------------------------------------

test('challenge progress counts check-ins between the two dates, inclusive', () => {
  const c = { starts_on: '2026-10-01', ends_on: '2026-10-31' };
  assert.equal(challengeProgress(['2026-09-30T20:00:00Z', '2026-10-01T06:00:00Z', '2026-10-31T19:00:00Z', '2026-11-01T06:00:00Z'], c), 2);
});

test('THE LEADERBOARD SHOWS A FIRST NAME AND AN INITIAL — and only those who chose to be on it', () => {
  assert.equal(boardName('Thandi Mokoena'), 'Thandi M.');
  assert.equal(boardName('Cher'), 'Cher');
  const board = leaderboard([
    { full_name: 'Thandi Mokoena', progress: 9, show_on_board: true, joined_at: '1' },
    { full_name: 'Sipho Dlamini', progress: 12, show_on_board: false, joined_at: '2' },
    { full_name: 'Ayesha Patel', progress: 11, show_on_board: true, joined_at: '3', you: true },
  ]);
  assert.deepEqual(board.map((b) => b.name), ['Ayesha P.', 'Thandi M.']);
  assert.equal(board[0].you, true);
});

test('a member joins a running challenge and sees their progress from real check-ins', async () => {
  const db = gymWith({
    challenges: [{ id: 'ch1', title: 'October 12', target_visits: 12, starts_on: addDays(TODAY, -5), ends_on: addDays(TODAY, 20), is_active: true }],
    checkins: [{ id: 'c1', member_id: 'm1', checked_in_at: `${addDays(TODAY, -1)}T08:00:00Z` }, { id: 'c2', member_id: 'm1', checked_in_at: `${addDays(TODAY, -30)}T08:00:00Z` }],
  });
  const j = await call(memberChallenges, db, { method: 'POST', token: memberToken(), body: { challenge_id: 'ch1', action: 'join', show_on_board: false } });
  assert.equal(j.statusCode, 200, j.body);
  const v = await call(memberChallenges, db, { token: memberToken() });
  const c = v.json.challenges[0];
  assert.equal(c.joined, true);
  assert.equal(c.progress, 1, 'only the visit inside the dates');
  assert.deepEqual(c.board, [], 'they chose to stay off the board');
});

test('an ended challenge cannot be joined', async () => {
  const db = gymWith({ challenges: [{ id: 'ch1', title: 'Old', target_visits: 5, starts_on: '2026-01-01', ends_on: '2026-01-31', is_active: true }] });
  const r = await call(memberChallenges, db, { method: 'POST', token: memberToken(), body: { challenge_id: 'ch1', action: 'join' } });
  assert.equal(r.statusCode, 400);
});

// ---------------------------------------------------------------------------
// Family and group
// ---------------------------------------------------------------------------

test('family rules: one group each, a size limit, discounts by kind', () => {
  const pricing = cleanGroupPricing({ max_members: 2 });
  const group = { id: 'g1' };
  assert.match(addProblem({ group, links: [{ member_id: 'a' }, { member_id: 'b' }], member: { id: 'c' }, pricing }), /at most 2/);
  assert.match(addProblem({ group, links: [], member: { id: 'c' }, pricing, memberLinkedElsewhere: true }), /another family/);
  assert.equal(discountFor('family', cleanGroupPricing({ family_discount_pct: 20 })), 20);
});

test('STAFF BUILD A FAMILY: create, add by membership number, choose who pays, and the member sees it', async () => {
  const db = gymWith({
    members: [
      { id: 'm1', full_name: 'Thandi Mokoena', membership_number: 'GYM-2026-000001', status: 'active' },
      { id: 'm2', full_name: 'Lindiwe Mokoena', membership_number: 'GYM-2026-000002', status: 'active' },
    ],
  });
  const created = await call(adminGroups, db, { method: 'POST', url: '/api/admin/member-groups', token: staffToken(), body: { action: 'create', name: 'The Mokoenas', kind: 'family', member_id: 'm1' } });
  assert.equal(created.statusCode, 200, created.body);
  const gid = db.tables.member_groups[0].id;
  const added = await call(adminGroups, db, { method: 'POST', url: '/api/admin/member-groups', token: staffToken(), body: { action: 'add', group_id: gid, membership_number: 'gym-2026-000002' } });
  assert.equal(added.statusCode, 200, added.body);
  await call(adminGroups, db, { method: 'POST', url: '/api/admin/member-groups', token: staffToken(), body: { action: 'payer', group_id: gid, member_id: 'm2' } });

  const seen = await call(memberFamily, db, { token: memberToken() });
  assert.equal(seen.json.group.name, 'The Mokoenas');
  assert.deepEqual(seen.json.group.members.map((m) => m.name).sort(), ['Lindiwe', 'Thandi'], 'first names only');
  assert.equal(seen.json.group.you_pay, false);
  assert.ok(seen.json.group.members.find((m) => m.name === 'Lindiwe').is_payer);
});

test('the payer leaving hands the paying on; the last one out closes the family', async () => {
  const db = gymWith({
    members: [{ id: 'm1', full_name: 'A', status: 'active' }, { id: 'm2', full_name: 'B', status: 'active' }],
    member_groups: [{ id: 'g1', name: 'F', kind: 'family', payer_member_id: 'm1' }],
    member_group_links: [{ group_id: 'g1', member_id: 'm1', added_at: '1' }, { group_id: 'g1', member_id: 'm2', added_at: '2' }],
  });
  await call(adminGroups, db, { method: 'POST', url: '/api/admin/member-groups', token: staffToken(), body: { action: 'remove', group_id: 'g1', member_id: 'm1' } });
  assert.equal(db.tables.member_groups[0].payer_member_id, 'm2');
  await call(adminGroups, db, { method: 'POST', url: '/api/admin/member-groups', token: staffToken(), body: { action: 'remove', group_id: 'g1', member_id: 'm2' } });
  assert.equal(db.tables.member_groups.length, 0);
});

// ---------------------------------------------------------------------------
// The screens
// ---------------------------------------------------------------------------

test('the portal and the app offer each service only where the gym has it', () => {
  const portal = readFileSync('src/pages/MemberPortal.jsx', 'utf8');
  assert.match(portal, /\['rewards', 'Rewards', \['rewards', 'challenges'\]\]/);
  assert.match(portal, /serviceOn\(features, off, 'freeze'\) && <div className="mt-4"><PausePanel \/>/);
  assert.match(portal, /serviceOn\(features, off, 'family'\) && <div className="mt-4"><FamilyPanel \/>/);
  const app = readFileSync('apps/mobile/www/member.js', 'utf8');
  assert.match(app, /needs: \['rewards', 'challenges'\]/);
  assert.match(app, /if \(has\('freeze'\)\)/);
  assert.match(app, /if \(has\('family'\)\)/);
  const detail = readFileSync('src/pages/admin/MemberDetail.jsx', 'utf8');
  assert.match(detail, /hasFeature\('freeze'\) && <PauseCard/);
  assert.match(detail, /hasFeature\('family'\) && <FamilyCard/);
  const shell = readFileSync('src/components/AdminShell.jsx', 'utf8');
  assert.match(shell, /to: '\/admin\/rewards'[^}]*feature: 'rewards'/);
  assert.match(shell, /to: '\/admin\/challenges'[^}]*feature: 'challenges'/);
});
