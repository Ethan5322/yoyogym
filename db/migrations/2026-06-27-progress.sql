-- Migration: member progress tracking (weight / measurements) — 2026-06-27
-- Apply to EACH gym's Supabase (SQL Editor → run). Idempotent & safe.

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
