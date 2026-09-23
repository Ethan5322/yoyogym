-- =============================================================================
-- YOYO GYMS — IS EVERYTHING HEALTHY?
-- =============================================================================
-- Read-only. Runs no change of any kind. Safe to run whenever.
-- =============================================================================

-- 1. THE ONE THAT WOULD BREAK PROVISIONING.
--    The exposed-schema list lives on the `authenticator` role, NOT in the
--    dashboard's checkbox — we learned that the hard way. Every gym ever
--    provisioned gets appended here, so it must already contain all four.
select 'exposed schemas' as check,
       coalesce(
         (select replace(cfg, 'pgrst.db_schemas=', '')
            from pg_roles r, unnest(r.rolconfig) cfg
           where r.rolname = 'authenticator'
             and cfg like 'pgrst.db_schemas=%'
           limit 1),
         '*** NOT SET — provisioning would drop every schema ***'
       ) as value;

-- 2. YOUR TENANTS, and where each one's data actually lives.
select 'tenant' as check,
       g.slug,
       g.search_name,
       g.status,
       g.plan_key,
       c.schema_name,
       c.status as connection,
       s.status as subscription
from platform.gyms g
left join platform.gym_connections       c on c.gym_id = g.id
left join platform.platform_subscriptions s on s.gym_id = g.id
order by g.created_at;

-- 3. DO THE SCHEMAS THOSE CONNECTIONS POINT AT ACTUALLY EXIST?
--    A connection naming a schema that is not there is a gym that cannot
--    serve anybody.
select 'schema exists' as check,
       c.schema_name,
       case when n.nspname is null then '*** MISSING ***' else 'yes' end as present
from platform.gym_connections c
left join pg_namespace n on n.nspname = c.schema_name;

-- 4. PRICES. Billing skips any plan with no price and charges nobody.
select 'plan' as check,
       key,
       max_active_members as members,
       case when price_cents is null or price_cents <= 0
            then '*** NO PRICE — bills nobody ***'
            else currency || ' ' || (price_cents / 100.0)::numeric(10,2)::text
       end as price
from platform.platform_plans
order by max_active_members;

-- 5. YOUR OWN ACCOUNT. 2FA is required for staff, so without it you cannot
--    sign in at all.
select 'staff account' as check,
       email,
       is_active,
       password_hash is not null as has_password,
       totp_enabled,
       jsonb_array_length(recovery_code_hashes) as recovery_codes_left
from platform.platform_users
where kind = 'platform_staff';

-- 6. WHAT THE PLATFORM HAS BEEN DOING.
select 'recent activity' as check, action, count(*) as times, max(created_at) as latest
from platform.platform_audit_log
group by action
order by max(created_at) desc
limit 10;
