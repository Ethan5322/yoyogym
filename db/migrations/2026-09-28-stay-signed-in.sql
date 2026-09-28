-- 2026-09-28 — stay signed in until sign out (CLAUDE.md §38.1 Q2, Q3).
--
-- Members, owners and staff now stay signed in on their phone until they sign
-- out. What keeps that safe is this number: every session carries it, and the
-- gym raises it to sign one person out everywhere ("lost phone", a staff
-- member who left). Every existing row starts at 0, so nothing changes for
-- anyone until it is used.
--
-- Idempotent. Runs over EVERY gym schema listed in the registry — `gym` for
-- KOM, `gym_<slug>` for any other — so it never needs editing per gym. Gyms
-- provisioned from now on get the column from db/schema.sql.

do $$
declare s text;
begin
  for s in select distinct schema_name from platform.gym_connections loop
    execute format('alter table %I.members add column if not exists session_version integer not null default 0', s);
    execute format('alter table %I.admin_users add column if not exists session_version integer not null default 0', s);
  end loop;
end $$;
