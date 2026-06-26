-- Migration: audit log + settings.updated_by (2026-06-26)
-- Apply to EACH existing gym's Supabase (SQL Editor → run). Idempotent & safe.
-- New tenants get this automatically from db/schema.sql.

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
