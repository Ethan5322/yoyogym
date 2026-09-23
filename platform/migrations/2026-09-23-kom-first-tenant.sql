-- =============================================================================
-- MAKE THE EXISTING GYM TENANT #1  —  "KOM"
-- =============================================================================
-- The gym running today has 24 tables of real members, payments and check-ins
-- in the schema `gym`. This makes it a tenant of the platform.
--
--   >>> NO DATA MOVES. NOTHING IS COPIED. NOTHING IS DELETED. <<<
--
-- The whole trick is one column. `gym_connections.schema_name` tells the
-- resolver which schema a gym lives in, and for KOM that value is simply
-- `gym` — the schema it is already in. Every member, every payment and every
-- check-in stays exactly where it is and becomes KOM's.
--
-- Other gyms provisioned later get `gym_<slug>`. KOM keeps `gym` because it
-- was there first, and renaming a live schema to make it look tidy would be
-- risk taken for no reason at all.
--
-- Safe to run twice: every statement is `on conflict do nothing` or guarded.
-- =============================================================================

-- 1. FIX A CONSTRAINT THAT WOULD BLOCK EVERY PROVISION.
--    These were `not null` from the project-per-gym design. Under schema-per-gym
--    a gym has no project or URL of its own, so provisioning writes null.
alter table platform.gym_connections alter column supabase_project_ref drop not null;
alter table platform.gym_connections alter column supabase_url         drop not null;

-- 2. THE REGISTRY ROW.
--    Owned by the platform owner for now. Hand it to the real gym owner later
--    by updating owner_user_id — that is an ordinary row change.
insert into platform.gyms (slug, search_name, legal_name, status, plan_key, owner_user_id, country, city)
select
  'kom',
  'KOM',
  'KOM',
  'active',              -- it is already serving real members today
  'prime',               -- everything on, since it already has every feature
  u.id,
  'ZA',
  null
from platform.platform_users u
where u.kind = 'platform_staff'
order by u.created_at
limit 1
on conflict (slug) do nothing;

-- 3. THE CONNECTION — the line that does the actual work.
--    schema_name = 'gym', because that is where the data already is.
insert into platform.gym_connections (gym_id, schema_name, status, supabase_project_ref, supabase_url)
select g.id, 'gym', 'healthy', null, null
from platform.gyms g
where g.slug = 'kom'
  and not exists (select 1 from platform.gym_connections c where c.gym_id = g.id);

-- 4. A SUBSCRIPTION, so billing and access checks have something to read.
--    No price is charged: KOM is yours, and `cancel_at` being null with a far
--    period end simply means nothing comes due.
insert into platform.platform_subscriptions (gym_id, plan_id, status, current_period_start, current_period_end)
select g.id, p.id, 'active', now(), now() + interval '100 years'
from platform.gyms g
join platform.platform_plans p on p.key = 'prime'
where g.slug = 'kom'
  and not exists (select 1 from platform.platform_subscriptions s where s.gym_id = g.id);

-- =============================================================================
-- CHECK IT WORKED
-- =============================================================================
select g.slug,
       g.search_name,
       g.status,
       g.plan_key,
       c.schema_name          as "data lives in",
       s.status               as subscription,
       (select count(*) from gym.members) as "members it now owns"
from platform.gyms g
left join platform.gym_connections      c on c.gym_id = g.id
left join platform.platform_subscriptions s on s.gym_id = g.id
where g.slug = 'kom';
