-- Consolidated migration for the 2026-06-27 member↔admin + member-experience
-- update. Apply to EACH gym's Supabase (SQL Editor → run). Idempotent & safe to
-- re-run. New tenants get all of this automatically from db/schema.sql.
--
-- Covers: admin inbox + two-way messaging, announcements, member progress
-- tracking, and the referral program.

-- ── Admin inbox (messages + member-action alerts) ──────────────────────────
create table if not exists gym.admin_inbox (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null default 'message',
  type           text,
  title          text,
  body           text,
  member_id      uuid references gym.members(id) on delete set null,
  sender_name    text,
  sender_role    text,
  link           text,
  is_read        boolean not null default false,
  created_at     timestamptz not null default now()
);
-- two-way messaging columns
alter table gym.admin_inbox add column if not exists direction      text not null default 'in';
alter table gym.admin_inbox add column if not exists parent_id      uuid references gym.admin_inbox(id) on delete cascade;
alter table gym.admin_inbox add column if not exists is_read_member boolean not null default false;
create index if not exists admin_inbox_created_idx on gym.admin_inbox(created_at desc);
create index if not exists admin_inbox_unread_idx on gym.admin_inbox(is_read) where is_read = false;
create index if not exists admin_inbox_member_idx on gym.admin_inbox(member_id);
alter table gym.admin_inbox enable row level security;

-- ── Announcements (management → members news feed) ─────────────────────────
create table if not exists gym.announcements (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  body            text,
  is_published    boolean not null default true,
  created_by      uuid references gym.admin_users(id) on delete set null,
  created_by_name text,
  created_at      timestamptz not null default now()
);
create index if not exists announcements_created_idx on gym.announcements(created_at desc);
alter table gym.announcements enable row level security;

-- ── Member progress tracking ───────────────────────────────────────────────
create table if not exists gym.progress_entries (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references gym.members(id) on delete cascade,
  recorded_on  date not null default current_date,
  weight_kg    numeric,
  body_fat_pct numeric,
  chest_cm     numeric,
  waist_cm     numeric,
  hips_cm      numeric,
  arms_cm      numeric,
  thighs_cm    numeric,
  note         text,
  created_at   timestamptz not null default now()
);
create index if not exists progress_member_idx on gym.progress_entries(member_id, recorded_on desc);
alter table gym.progress_entries enable row level security;

-- ── Referral program ───────────────────────────────────────────────────────
create table if not exists gym.referrals (
  id                 uuid primary key default gen_random_uuid(),
  referrer_member_id uuid references gym.members(id) on delete set null,
  referrer_name      text,
  friend_name        text not null,
  friend_phone       text,
  friend_email       text,
  status             text not null default 'pending',
  created_at         timestamptz not null default now()
);
create index if not exists referrals_referrer_idx on gym.referrals(referrer_member_id);
alter table gym.referrals enable row level security;
