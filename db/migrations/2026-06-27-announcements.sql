-- Migration: gym announcements (admin -> members news feed) — 2026-06-27
-- Apply to EACH gym's Supabase (SQL Editor → run). Idempotent & safe.

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
