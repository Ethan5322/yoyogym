-- 2026-09-24 — password resets for platform accounts.
--
-- NOT YET RUN. Paste into the Supabase SQL editor for the project that holds
-- the platform schema. Idempotent: safe to run twice.
--
-- Until this runs, "Forgot your password?" answers as normal but no link can
-- be issued — the request fails server-side and is logged.

-- -----------------------------------------------------------------------------
-- password_resets — "I forgot my password" for platform accounts.
-- HASHES ONLY, one hour, single use (platform/password-reset.js).
-- -----------------------------------------------------------------------------
create table if not exists platform.password_resets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references platform.platform_users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists password_resets_user_idx on platform.password_resets(user_id);

alter table platform.password_resets enable row level security;
