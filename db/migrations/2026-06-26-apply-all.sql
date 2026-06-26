-- =============================================================================
-- APPLY-ALL migration for the 2026-06-26 updates.
-- Paste this whole block into Supabase → SQL Editor → Run, for EACH gym.
-- Safe to run more than once (every statement is IF NOT EXISTS / idempotent).
-- Schema is "gym" (matches SUPABASE_SCHEMA=gym).
-- =============================================================================

-- 1) Audit log (who did what) ------------------------------------------------
create table if not exists gym.audit_log (
  id          uuid primary key default gen_random_uuid(),
  admin_id    uuid references gym.admin_users(id) on delete set null,
  admin_name  text,
  action      text not null,
  entity      text,
  entity_id   text,
  detail      text,
  created_at  timestamptz not null default now()
);
create index if not exists audit_created_idx on gym.audit_log(created_at);
alter table gym.audit_log enable row level security;

-- settings.updated_by (no-op if it already exists)
alter table gym.settings add column if not exists updated_by uuid references gym.admin_users(id) on delete set null;

-- 2) Staff credentials (ID card + face + verify QR) --------------------------
alter table gym.admin_users add column if not exists staff_number      text;
alter table gym.admin_users add column if not exists verification_code text;
alter table gym.admin_users add column if not exists job_title         text;
alter table gym.admin_users add column if not exists phone             text;
alter table gym.admin_users add column if not exists photo_url         text;
create unique index if not exists admin_users_staff_number_key
  on gym.admin_users(staff_number) where staff_number is not null;

-- 3) Trainer credentials -----------------------------------------------------
alter table gym.trainers add column if not exists photo_url         text;
alter table gym.trainers add column if not exists trainer_number    text;
alter table gym.trainers add column if not exists verification_code text;
create unique index if not exists trainers_trainer_number_key
  on gym.trainers(trainer_number) where trainer_number is not null;

-- Done. Audit logging + staff/trainer ID cards are now fully active.
