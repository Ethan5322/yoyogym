-- 2026-09-28 — services by plan and per gym, support contacts, setup help, and
-- the agreement accepted at registration (CLAUDE.md §41, vault D-164).
--
-- NOT YET RUN. Paste into the Supabase SQL editor for the project that holds
-- the platform schema. Idempotent: safe to run twice.
--
-- Until this runs: every gym keeps exactly its plan's services (the gym's API
-- reads the new columns separately and carries on without them); support shows
-- the default email; an application is still saved, without the terms record.

-- One gym's own additions to, and removals from, its plan (§41.1 Q2).
alter table platform.gyms add column if not exists features_added   jsonb not null default '[]'::jsonb;
alter table platform.gyms add column if not exists features_removed jsonb not null default '[]'::jsonb;

-- A named Yoyo contact, and setup help asked for and given (§41.1 Q6).
alter table platform.gyms add column if not exists account_manager_id uuid references platform.platform_users(id) on delete set null;
alter table platform.gyms add column if not exists setup_help_requested_at timestamptz;
alter table platform.gyms add column if not exists setup_help_done_at timestamptz;

-- Which Gym Owner Agreement was ticked at registration, and when (§41.1 Q5).
alter table platform.gym_applications add column if not exists terms_version text;
alter table platform.gym_applications add column if not exists terms_accepted_at timestamptz;

-- Platform-wide values the platform owner edits in the panel (§41.1 Q7).
create table if not exists platform.platform_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_by uuid references platform.platform_users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table platform.platform_settings enable row level security;
