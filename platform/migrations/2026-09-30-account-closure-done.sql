-- When an owner's account was closed (CLAUDE.md §46.1 Q3).
--
-- An owner asks to close their account (closure_requested_at, 2026-09-24);
-- Yoyo staff may close it sooner, and the nightly job closes it on day 30.
-- This records that it is done, so the job never closes it twice.

alter table platform.platform_users
  add column if not exists closure_completed_at timestamptz;
