-- 2026-09-29 — the four member services (CLAUDE.md §41.1 Q3, vault D-165):
-- pause, rewards, challenges, family and group memberships.
--
-- NOT YET RUN. Idempotent. Run it once per EXISTING gym schema: `gym` for the
-- first gym (KOM), and `gym_<slug>` for any gym provisioned before today —
-- replace `gym.` below. Gyms provisioned from now on get these from
-- db/schema.sql.
--
-- /api/health lists this migration while the tables are missing.


-- A member's pause: the membership's end date moves on by the days paused,
-- and the member cannot check in until it ends.
create table if not exists gym.membership_pauses (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references gym.members(id) on delete cascade,
  membership_id uuid references gym.memberships(id) on delete set null,
  starts_on     date not null,
  ends_on       date not null,
  days          integer not null check (days > 0),
  reason        text,
  created_by    text not null default 'member',   -- member | staff
  resumed_at    timestamptz,                      -- ended early, or by the daily job
  created_at    timestamptz not null default now()
);
create index if not exists membership_pauses_member_idx on gym.membership_pauses(member_id);
create index if not exists membership_pauses_open_idx   on gym.membership_pauses(ends_on) where resumed_at is null;

-- What a member can claim with their points, as the owner lists it.
create table if not exists gym.rewards (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  points      integer not null check (points > 0),
  is_enabled  boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- A claim, handed over at the gym. The name and points are copied, so a later
-- edit to the reward does not rewrite what was claimed.
create table if not exists gym.reward_claims (
  id          uuid primary key default gen_random_uuid(),
  reward_id   uuid references gym.rewards(id) on delete set null,
  member_id   uuid not null references gym.members(id) on delete cascade,
  reward_name text not null,
  points      integer not null check (points > 0),
  status      text not null default 'pending',     -- pending | given | cancelled
  decided_at  timestamptz,
  decided_by  uuid,
  created_at  timestamptz not null default now()
);
create index if not exists reward_claims_member_idx on gym.reward_claims(member_id);
create index if not exists reward_claims_status_idx on gym.reward_claims(status);

-- A challenge the owner runs: visits between two dates, counted from check-ins.
create table if not exists gym.challenges (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  target_visits integer not null check (target_visits > 0),
  starts_on     date not null,
  ends_on       date not null,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (ends_on >= starts_on)
);

-- Who joined. Joining is the member's choice, and so is the leaderboard.
create table if not exists gym.challenge_entries (
  challenge_id  uuid not null references gym.challenges(id) on delete cascade,
  member_id     uuid not null references gym.members(id) on delete cascade,
  show_on_board boolean not null default true,
  joined_at     timestamptz not null default now(),
  primary key (challenge_id, member_id)
);

-- A family or group: several members, one payer.
create table if not exists gym.member_groups (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  kind            text not null default 'family',   -- family | group
  payer_member_id uuid references gym.members(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists gym.member_group_links (
  group_id  uuid not null references gym.member_groups(id) on delete cascade,
  member_id uuid not null references gym.members(id) on delete cascade,
  added_at  timestamptz not null default now(),
  primary key (group_id, member_id)
);
-- A member belongs to one family or group at a time.
create unique index if not exists member_group_links_member_uniq on gym.member_group_links(member_id);

alter table gym.membership_pauses  enable row level security;
alter table gym.rewards            enable row level security;
alter table gym.reward_claims      enable row level security;
alter table gym.challenges         enable row level security;
alter table gym.challenge_entries  enable row level security;
alter table gym.member_groups      enable row level security;
alter table gym.member_group_links enable row level security;
