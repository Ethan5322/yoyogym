-- 2026-09-24 — an owner can ask to close their account.
--
-- NOT YET RUN. Paste into the Supabase SQL editor. Idempotent.
--
-- Until this runs, "Close my account" reports that it could not record the
-- request, and the owner list carries on without the column (it retries).
alter table platform.platform_users add column if not exists closure_requested_at timestamptz;
