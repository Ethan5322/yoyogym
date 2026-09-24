-- 2026-09-24 — the column a member's deletion request writes to.
--
-- server/handlers/member/request-deletion.js has set
-- members.data_deletion_requested since it was written, and the admin member
-- page and dashboard read it. NO schema file or migration ever created it, so
-- unless it was added by hand, every "Request data deletion" failed with
-- "Request failed" — a POPIA right and a store requirement, on the one button
-- a member has for it.
--
-- NOT YET RUN. Idempotent. Run it once per EXISTING gym schema: `gym` for the
-- first gym (KOM), and `gym_<slug>` for any gym provisioned before today —
-- replace `gym.` below. Gyms provisioned from now on get it from db/schema.sql.
--
-- /api/health lists this migration while the column is missing.

alter table gym.members
  add column if not exists data_deletion_requested boolean not null default false;
