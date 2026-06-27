-- Migration: member referral program — 2026-06-27
-- Apply to EACH gym's Supabase (SQL Editor → run). Idempotent & safe.

create table if not exists gym.referrals (
  id                 uuid primary key default gen_random_uuid(),
  referrer_member_id uuid references gym.members(id) on delete set null,
  referrer_name      text,
  friend_name        text not null,
  friend_phone       text,
  friend_email       text,
  status             text not null default 'pending',  -- pending | joined | declined
  created_at         timestamptz not null default now()
);
create index if not exists referrals_referrer_idx on gym.referrals(referrer_member_id);
alter table gym.referrals enable row level security;
