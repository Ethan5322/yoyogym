-- =============================================================================
-- YOYO GYMS — PLATFORM SEED
-- Run AFTER platform/schema.sql, in the same Supabase project.
-- =============================================================================
-- Creates the roles, the permissions, the three plans, and your owner account.
--
-- ⚠️ TWO THINGS YOU MUST EDIT BEFORE RUNNING — search for "CHANGE ME".
-- =============================================================================

set search_path = platform, public;

-- -----------------------------------------------------------------------------
-- Permissions. Each is one thing a platform user may do.
-- -----------------------------------------------------------------------------
insert into platform.platform_permissions (key, label) values
  ('application.view',    'View gym applications'),
  ('application.approve', 'Approve an application and provision the gym'),
  ('application.reject',  'Reject an application'),
  ('gym.view',            'View the gym registry'),
  ('gym.suspend',         'Suspend or reactivate a gym'),
  ('subscription.manage', 'Manage plans, subscriptions and invoices'),
  ('secret.rotate',       'Rotate a gym''s credentials'),
  ('audit.view',          'Read the platform audit log'),
  ('platform.manage',     'Manage platform staff and settings')
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- Roles. Deliberately narrow: support can see that a gym is broken without
-- being able to see anybody's members (D-044).
-- -----------------------------------------------------------------------------
insert into platform.platform_roles (key, label, description) values
  ('platform_owner', 'Platform owner', 'Full control. Approves gyms, manages staff, rotates credentials.'),
  ('platform_admin', 'Platform admin', 'Day-to-day operations. No pricing or staff changes.'),
  ('reviewer',       'Reviewer',       'Reads applications and documents; approves or rejects.'),
  ('billing',        'Billing',        'Subscriptions and invoices only.'),
  ('support',        'Support',        'Read-only gym metadata and connection health. Never member data.'),
  ('read_only',      'Read only',      'Reporting and aggregate statistics.')
on conflict (key) do nothing;

-- platform_owner: everything.
insert into platform.platform_role_permissions (role_id, permission_id)
select r.id, p.id
from platform.platform_roles r, platform.platform_permissions p
where r.key = 'platform_owner'
on conflict do nothing;

-- platform_admin: operations, but not pricing or staff.
insert into platform.platform_role_permissions (role_id, permission_id)
select r.id, p.id
from platform.platform_roles r
join platform.platform_permissions p
  on p.key in ('application.view','application.approve','application.reject',
               'gym.view','gym.suspend','audit.view')
where r.key = 'platform_admin'
on conflict do nothing;

-- reviewer: applications only.
insert into platform.platform_role_permissions (role_id, permission_id)
select r.id, p.id
from platform.platform_roles r
join platform.platform_permissions p
  on p.key in ('application.view','application.approve','application.reject')
where r.key = 'reviewer'
on conflict do nothing;

-- billing: money only.
insert into platform.platform_role_permissions (role_id, permission_id)
select r.id, p.id
from platform.platform_roles r
join platform.platform_permissions p on p.key in ('subscription.manage','gym.view')
where r.key = 'billing'
on conflict do nothing;

-- support: look, do not touch.
insert into platform.platform_role_permissions (role_id, permission_id)
select r.id, p.id
from platform.platform_roles r
join platform.platform_permissions p on p.key in ('gym.view')
where r.key = 'support'
on conflict do nothing;

insert into platform.platform_role_permissions (role_id, permission_id)
select r.id, p.id
from platform.platform_roles r
join platform.platform_permissions p on p.key in ('gym.view','audit.view')
where r.key = 'read_only'
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- The three plans (CLAUDE.md §18).
--
-- PRICES ARE NULL ON PURPOSE. Set them when you have decided; they are data and
-- changing them needs no deploy. There is no hosting floor to clear any more
-- (D-100) — a gym is a schema in this same project and costs about nothing.
--
-- `features` must match shared/features.js. The tiers NEST: Medium contains
-- Basic, Prime contains Medium.
-- -----------------------------------------------------------------------------
insert into platform.platform_plans (key, label, description, max_active_members, max_locations, features, price_cents, currency)
values
  ('basic', 'Basic', 'Everything needed to run a small gym.', 40, 1,
   '["members","checkin","payments","catalog","settings","staff","qr"]'::jsonb,
   null, 'ZAR'),

  ('medium', 'Medium', 'For a growing gym running classes and personal training.', 150, 1,
   '["members","checkin","payments","catalog","settings","staff","qr",
     "classes","trainers","messaging","reporting","progress","data_io"]'::jsonb,
   null, 'ZAR'),

  ('prime', 'Prime', 'The complete system, including face recognition at the door.', 500, 1,
   '["members","checkin","payments","catalog","settings","staff","qr",
     "classes","trainers","messaging","reporting","progress","data_io",
     "face","access_control","advanced_analytics","marketing","referrals","audit"]'::jsonb,
   null, 'ZAR')
on conflict (key) do update
  set label = excluded.label,
      description = excluded.description,
      max_active_members = excluded.max_active_members,
      features = excluded.features,
      updated_at = now();

-- =============================================================================
-- YOUR OWNER ACCOUNT
-- =============================================================================
-- ⚠️ CHANGE ME (1): your email.
--
-- The password is set to NULL and 2FA is OFF, deliberately. A password typed
-- into a SQL editor ends up in your clipboard, your query history and possibly
-- a screenshot. Set it from the application instead, which hashes it properly
-- and walks you through enabling two-factor authentication.
-- =============================================================================
insert into platform.platform_users (email, full_name, kind, is_active, password_hash, totp_enabled)
values ('CHANGE-ME@example.com', 'Platform Owner', 'platform_staff', true, null, false)
on conflict (email) do nothing;

-- ⚠️ CHANGE ME (2): the same email again.
insert into platform.platform_user_roles (user_id, role_id)
select u.id, r.id
from platform.platform_users u, platform.platform_roles r
where u.email = 'CHANGE-ME@example.com' and r.key = 'platform_owner'
on conflict do nothing;

-- =============================================================================
-- CHECK IT WORKED
-- =============================================================================
-- Expect: 9 permissions, 6 roles, 3 plans, 1 owner with the platform_owner role.
-- =============================================================================
select 'permissions' as what, count(*) from platform.platform_permissions
union all select 'roles', count(*) from platform.platform_roles
union all select 'plans', count(*) from platform.platform_plans
union all select 'owner users', count(*) from platform.platform_users where kind = 'platform_staff'
union all select 'owner roles granted', count(*) from platform.platform_user_roles;
