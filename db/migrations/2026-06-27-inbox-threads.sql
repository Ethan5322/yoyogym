-- Migration: two-way messaging on admin_inbox — 2026-06-27
-- Apply to EACH gym's Supabase (SQL Editor → run). Idempotent & safe.
-- Adds reply threading so management can answer member/staff messages and the
-- member sees the conversation in their portal.
--   direction:       in  = member/staff -> admin   |  out = admin -> member
--   parent_id:       links a reply to the original message (thread)
--   is_read_member:  has the member seen this 'out' reply yet?

alter table gym.admin_inbox add column if not exists direction      text not null default 'in';
alter table gym.admin_inbox add column if not exists parent_id      uuid references gym.admin_inbox(id) on delete cascade;
alter table gym.admin_inbox add column if not exists is_read_member boolean not null default false;
create index if not exists admin_inbox_member_idx on gym.admin_inbox(member_id);
