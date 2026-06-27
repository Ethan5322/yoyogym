-- Migration: admin inbox (member/staff messages + member-action alerts) — 2026-06-27
-- Apply to EACH existing gym's Supabase (SQL Editor → run). Idempotent & safe.
-- New tenants get this automatically from db/schema.sql.
--
-- One table backs both the admin "notification bell" and the message inbox:
--   kind 'message' = a member or staff member wrote to management
--   kind 'event'   = a member action that management should see (booking,
--                    cancellation, plan-change request)

create table if not exists gym.admin_inbox (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null default 'message',   -- message | event
  type        text,                              -- member.message | staff.message | class.booked | class.cancelled | plan.change_request
  title       text,
  body        text,
  member_id   uuid references gym.members(id) on delete set null,
  sender_name text,
  sender_role text,                              -- member | staff | system
  link        text,                              -- admin route to open (e.g. /admin/members/<id>)
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists admin_inbox_created_idx on gym.admin_inbox(created_at desc);
create index if not exists admin_inbox_unread_idx on gym.admin_inbox(is_read) where is_read = false;
alter table gym.admin_inbox enable row level security;
