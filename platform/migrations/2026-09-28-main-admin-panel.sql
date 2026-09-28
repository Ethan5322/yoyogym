-- 2026-09-28 — the main admin panel, corporate level (CLAUDE.md §40, vault D-162).
--
-- NOT YET RUN. Paste into the Supabase SQL editor for the project that holds
-- the platform schema. Idempotent: safe to run twice.
--
-- Until this runs: an application is still saved, without the phone and
-- address (platform/deps.js retries without them); the Team page lists staff
-- but cannot send an invitation.

-- The owner's phone and the gym's street address on an application (§40.1 Q2).
alter table platform.gym_applications add column if not exists owner_phone text;
alter table platform.gym_applications add column if not exists gym_address text;

-- Invitations to the Yoyo staff team (§40.1 Q4). HASHES ONLY, 72 hours, single
-- use (platform/team.js). The link sets a password AND an authenticator.
create table if not exists platform.staff_invites (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references platform.platform_users(id) on delete cascade,
  token_hash  text not null unique,
  invited_by  uuid references platform.platform_users(id) on delete set null,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists staff_invites_user_idx on platform.staff_invites(user_id);

alter table platform.staff_invites enable row level security;
