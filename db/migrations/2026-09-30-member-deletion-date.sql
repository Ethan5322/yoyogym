-- When a member asked to delete their account (CLAUDE.md §46.1 Q3).
--
-- The gym has 30 days; on day 30 the morning job erases the account itself.
-- A request made before this column existed counts from its last update,
-- which is when it was recorded.
--
-- Run once in each existing gym schema. For KOM the schema is `gym`, as
-- written; for another gym, replace `gym.` with its own schema, e.g.
-- `gym_cocate_gym.`. New gyms get the column from db/schema.sql.

alter table gym.members
  add column if not exists data_deletion_requested_at timestamptz;

update gym.members
   set data_deletion_requested_at = updated_at
 where data_deletion_requested
   and data_deletion_requested_at is null;
