-- =============================================================================
-- YOYO GYMS — PLATFORM DATABASE SCHEMA  (Supabase / PostgreSQL)
-- MuleSoo Digital Solutions
-- =============================================================================
-- This is the PLATFORM's own schema: the registry, applications,
-- subscriptions and audit.
--
--   >>> IT HOLDS NO MEMBER DATA. <<<
--
-- No member names, no health answers, no biometric templates, no member
-- payments. That is not a convention, it is the property that keeps the POPIA
-- position from D-014 intact: each gym remains responsible party for its own
-- members' data, in its own schema.
--
-- WHERE THIS RUNS  (this changed — read it even if you have run it before)
--
-- D-016 originally gave every gym its own Supabase project, and this file said
-- to create a separate project for the platform. **D-096 superseded that.**
-- Every gym is now a SCHEMA (`gym_<slug>`) inside ONE Supabase project, and
-- the platform is simply one more schema in that same project.
--
--   >>> RUN THIS IN YOUR EXISTING SUPABASE PROJECT — the one the single-gym
--   >>> system already uses. Do NOT create a new project for it.
--
-- It cannot collide with what is already there: everything below is created
-- inside the `platform` schema, and the existing gym data lives in `gym` and
-- `public`. No existing table is read, altered or dropped by this file.
--
-- HOW TO USE:
--   1. Supabase dashboard -> your existing project -> SQL Editor -> New query.
--   2. Paste this whole file -> Run. It is idempotent: running it twice is
--      safe, because every statement is `if not exists`.
--   3. Then paste platform/seed.sql and run that (edit the two CHANGE ME
--      lines in it first).
--   4. Settings -> API -> Exposed schemas: add `platform`, and add each
--      `gym_<slug>` as gyms are provisioned. Provisioning does this itself.
--
-- DESIGN NOTES:
--   • Everything lives in the `platform` schema, mirroring how a gym uses `gym`.
--   • RLS is ENABLED on every table with NO policies -> default-deny for anon
--     and authenticated roles, exactly as the gym schema does. The platform
--     server uses the service-role key.
--   • Status fields are plain text, documented inline, matching db/schema.sql.
--   • Deletion policy is deliberate: `restrict` where a record must never
--     vanish (gym ownership, invoices), `set null` where history must outlive
--     the person, `cascade` only from a parent to its own dependents.
-- =============================================================================

create schema if not exists platform;
create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists citext;     -- case-insensitive email / slug

set search_path = platform, public;

-- -----------------------------------------------------------------------------
-- platform_users — platform-side identities. A SEPARATE NAMESPACE from every
-- gym's gym.admin_users. A gym owner has a row HERE and an `owner` row in their
-- own gym database; they are different records and must never be conflated.
-- kind: platform_staff | gym_owner
-- -----------------------------------------------------------------------------
create table if not exists platform.platform_users (
  id             uuid primary key default gen_random_uuid(),
  email          citext unique not null,
  password_hash  text,
  full_name      text,
  kind           text not null default 'gym_owner',
  is_active      boolean not null default true,
  -- Mirrors the gym admin hardening: 5 attempts -> 15 minute lock.
  failed_logins  integer not null default 0,
  locked_until   timestamptz,
  -- 2FA is REQUIRED for platform_staff (D-077). This account approves gyms and
  -- reaches every gym's secrets, so it is not optional here as it is for gyms.
  totp_secret    text,
  totp_enabled   boolean not null default false,
  -- SHA-256 hashes of single-use recovery codes (D-088/D-089). Shown once at
  -- setup, stored only as hashes, consumed on use.
  recovery_code_hashes jsonb not null default '[]'::jsonb,
  last_login_at  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists platform_users_kind_idx   on platform.platform_users(kind);
create index if not exists platform_users_active_idx on platform.platform_users(is_active);

-- -----------------------------------------------------------------------------
-- Roles and permissions as DATA, not constants in code — the same rule the
-- subscription tiers follow. Permissions can change without a deploy.
-- -----------------------------------------------------------------------------
create table if not exists platform.platform_roles (
  id          uuid primary key default gen_random_uuid(),
  key         citext unique not null,   -- platform_owner | platform_admin | reviewer | billing | support | read_only
  label       text not null,
  description text,
  created_at  timestamptz not null default now()
);

create table if not exists platform.platform_permissions (
  id         uuid primary key default gen_random_uuid(),
  key        citext unique not null,    -- application.approve | gym.suspend | secret.rotate | ...
  label      text not null,
  created_at timestamptz not null default now()
);

create table if not exists platform.platform_role_permissions (
  role_id       uuid not null references platform.platform_roles(id) on delete cascade,
  permission_id uuid not null references platform.platform_permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table if not exists platform.platform_user_roles (
  user_id    uuid not null references platform.platform_users(id) on delete cascade,
  role_id    uuid not null references platform.platform_roles(id) on delete cascade,
  granted_by uuid references platform.platform_users(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

-- -----------------------------------------------------------------------------
-- gym_applications — a gym owner applying to join the platform.
-- status: draft | submitted | under_review | info_requested | approved | rejected | withdrawn
-- Reviewed MANUALLY, no published SLA (D-048). Rejection gives a reason and the
-- owner may reapply; there is no formal appeal (D-061).
-- -----------------------------------------------------------------------------
create table if not exists platform.gym_applications (
  id                 uuid primary key default gen_random_uuid(),
  applicant_user_id  uuid not null references platform.platform_users(id) on delete restrict,
  status             text not null default 'draft',
  proposed_gym_name  text,
  -- The routing key derived from the gym name: "BOS GYM" -> "bos-gym".
  -- Becomes gyms.slug, and gym_<slug> becomes the schema.
  slug               citext,
  -- The plan the owner picked while applying (D-099).
  requested_plan_key citext,
  -- "Is there anything your gym needs that this does not do?" (D-104).
  -- Demand evidence, read against the gap list in CLAUDE.md 18.5.
  owner_needs        text,
  country            text,                    -- ISO-3166 alpha-2
  city               text,
  -- Captured at application because app search needs it and the four required
  -- documents do not provide it (D-065).
  latitude           numeric(9,6),
  longitude          numeric(9,6),
  estimated_members  integer,
  submitted_at       timestamptz,
  decided_at         timestamptz,
  decided_by         uuid references platform.platform_users(id) on delete set null,
  decision_reason    text,
  review_notes       text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists gym_applications_status_idx    on platform.gym_applications(status);
create index if not exists gym_applications_applicant_idx on platform.gym_applications(applicant_user_id);
create index if not exists gym_applications_submitted_idx on platform.gym_applications(submitted_at desc);
create unique index if not exists gym_applications_slug_idx on platform.gym_applications(slug) where slug is not null;

-- -----------------------------------------------------------------------------
-- application_documents — the four required documents (D-047):
--   business_registration | owner_id | proof_of_premises | tax_clearance
--
-- The FILE lives in Supabase Storage in this platform project (D-050), never in
-- a gym's database. `storage_ref` is a pointer; access is by signed URL.
--
-- Two of the four are IDENTITY documents, which makes retention a POPIA
-- obligation rather than filing preference (D-054): rejected applications are
-- purged after the appeal window; an approved gym's are kept while it trades.
-- -----------------------------------------------------------------------------
create table if not exists platform.application_documents (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references platform.gym_applications(id) on delete cascade,
  doc_type       text not null,
  storage_ref    text not null,            -- path in Supabase Storage. NOT the file.
  filename       text,
  mime_type      text,
  size_bytes     bigint,
  sha256         text,
  status         text not null default 'pending',   -- pending | accepted | rejected
  reviewed_by    uuid references platform.platform_users(id) on delete set null,
  reviewed_at    timestamptz,
  reject_reason  text,
  retention_until date,                    -- D-054. Enforced by a scheduled purge.
  uploaded_at    timestamptz not null default now()
);
create index if not exists application_documents_app_idx       on platform.application_documents(application_id);
create index if not exists application_documents_status_idx    on platform.application_documents(status);
create index if not exists application_documents_retention_idx on platform.application_documents(retention_until);

-- -----------------------------------------------------------------------------
-- application_events — the approval / rejection history.
-- APPEND-ONLY. Never updated, never deleted. No handler may offer an update or
-- delete path: this is the record of why a gym was let in or turned away.
-- -----------------------------------------------------------------------------
create table if not exists platform.application_events (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references platform.gym_applications(id) on delete cascade,
  event          text not null,   -- submitted | info_requested | approved | rejected | withdrawn | document_accepted | document_rejected
  actor_user_id  uuid references platform.platform_users(id) on delete set null,
  reason         text,
  detail         jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists application_events_app_idx     on platform.application_events(application_id);
create index if not exists application_events_created_idx on platform.application_events(created_at desc);

-- -----------------------------------------------------------------------------
-- gyms — THE REGISTRY. The anchor of the whole platform, and the source of app
-- search results (D-036).
-- status: pending | approved | provisioning | active | suspended | terminated | rejected
--   pending      = provisioned but not yet paid (trial or awaiting first payment)
--   active       = serving traffic, findable in app search
--   suspended    = no platform access, DATA INTACT (D-027)
--   terminated   = deleted after 90 suspended days (D-071)
-- -----------------------------------------------------------------------------
create table if not exists platform.gyms (
  id             uuid primary key default gen_random_uuid(),
  slug           citext unique not null,      -- routing key: QR payloads, deep links
  search_name    text,                        -- human name, for app search matching
  legal_name     text,
  trading_name   text,
  status         text not null default 'pending',
  -- The gym's current plan. Entitlements are resolved from this server-side;
  -- a client never states its own plan.
  plan_key       citext,
  owner_user_id  uuid not null references platform.platform_users(id) on delete restrict,
  application_id uuid references platform.gym_applications(id) on delete set null,
  country        text,
  city           text,
  timezone       text,
  -- D-065: "gyms near me" in app search. Simple distance first; PostGIS only if
  -- that proves insufficient.
  latitude       numeric(9,6),
  longitude      numeric(9,6),
  activated_at   timestamptz,
  suspended_at   timestamptz,
  terminated_at  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists gyms_status_idx  on platform.gyms(status);
create index if not exists gyms_owner_idx   on platform.gyms(owner_user_id);
create index if not exists gyms_country_idx on platform.gyms(country);
create index if not exists gyms_search_idx  on platform.gyms(search_name);
create index if not exists gyms_geo_idx     on platform.gyms(latitude, longitude);

-- -----------------------------------------------------------------------------
-- owner_activations — the verification link + code step.
-- HASHES ONLY. Never the raw token or code, for the same reason passwords are
-- never stored in plaintext.
-- -----------------------------------------------------------------------------
create table if not exists platform.owner_activations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references platform.platform_users(id) on delete cascade,
  gym_id     uuid not null references platform.gyms(id) on delete cascade,
  token_hash text not null,
  code_hash  text not null,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists owner_activations_user_idx    on platform.owner_activations(user_id);
create index if not exists owner_activations_expires_idx on platform.owner_activations(expires_at);

-- -----------------------------------------------------------------------------
-- gym_connections — how the platform reaches ONE gym's Supabase project.
-- status: provisioning | healthy | degraded | unreachable | retired
-- -----------------------------------------------------------------------------
create table if not exists platform.gym_connections (
  id                   uuid primary key default gen_random_uuid(),
  gym_id               uuid not null references platform.gyms(id) on delete cascade,
  supabase_project_ref text not null,          -- the project ref, NOT a key
  supabase_url         text not null,
  db_region            text,
  schema_name          text not null default 'gym',
  app_base_url         text,
  schema_version       text,                   -- last migration applied; see migration_runs
  status               text not null default 'provisioning',
  last_health_check_at timestamptz,
  last_health_status   text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
-- At most ONE live connection per gym; retired rows stay for history.
create unique index if not exists gym_connections_one_live_idx
  on platform.gym_connections(gym_id) where status <> 'retired';
create index if not exists gym_connections_status_idx on platform.gym_connections(status);
create index if not exists gym_connections_ref_idx    on platform.gym_connections(supabase_project_ref);
create index if not exists gym_connections_health_idx on platform.gym_connections(last_health_check_at);

-- -----------------------------------------------------------------------------
-- gym_secrets — REFERENCES ONLY.
--
--   >>> NO COLUMN IN THIS TABLE MAY EVER HOLD A SECRET VALUE. <<<
--
-- `secret_ref` is a pointer into the secrets manager (Infisical, D-069). A
-- database constraint cannot enforce "this text is not a secret", so this is a
-- documented invariant plus a code-review rule (D-022). If a secret value is
-- ever found here, treat it as an incident: ROTATE it, do not merely delete the
-- row.
--
-- One blob per gym is preferred over five separate entries: it makes rotation
-- atomic (one write, one version, one cache eviction).
-- -----------------------------------------------------------------------------
create table if not exists platform.gym_secrets (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references platform.gyms(id) on delete cascade,
  key_name   text not null,              -- e.g. 'gym_credentials' (the blob)
  secret_ref text not null,              -- path/id in the secrets manager
  version    integer not null default 1,
  rotated_at timestamptz,
  rotates_at timestamptz,
  created_at timestamptz not null default now(),
  unique (gym_id, key_name, version)
);
create index if not exists gym_secrets_gym_idx     on platform.gym_secrets(gym_id);
create index if not exists gym_secrets_rotates_idx on platform.gym_secrets(rotates_at);

-- -----------------------------------------------------------------------------
-- platform_plans — subscription tiers as DATA (never hard-coded).
-- Three tiers gated on active member count; PRICES DELIBERATELY NULL until the
-- real per-gym hosting cost is known (D-058). Note the floor: a gym costs about
-- $10/month in Supabase compute alone, so any price below that loses money.
-- -----------------------------------------------------------------------------
create table if not exists platform.platform_plans (
  id                 uuid primary key default gen_random_uuid(),
  key                citext unique not null,    -- basic | medium | prime
  label              text not null,
  description        text,
  max_active_members integer,
  max_locations      integer not null default 1,
  features           jsonb not null default '{}'::jsonb,   -- the feature-gate map
  price_cents        integer,                   -- NULL until set (D-058)
  currency           text not null default 'ZAR',
  billing_interval   text not null default 'month',
  is_enabled         boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists platform_plans_enabled_idx on platform.platform_plans(is_enabled);

-- -----------------------------------------------------------------------------
-- platform_subscriptions — GYMS paying the platform. Never members (D-013).
-- status: trialing | active | past_due | suspended | cancelled | expired
-- Lifecycle: 30-day trial (D-070) -> 2-day warning (D-026) -> suspend ->
--            delete after 90 suspended days (D-071).
-- -----------------------------------------------------------------------------
create table if not exists platform.platform_subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  gym_id               uuid not null references platform.gyms(id) on delete cascade,
  plan_id              uuid references platform.platform_plans(id) on delete restrict,
  status               text not null default 'trialing',
  trial_ends_at        timestamptz,
  current_period_start timestamptz,
  current_period_end   timestamptz,
  grace_ends_at        timestamptz,   -- the 2-day warning window (D-026), as DATA
  cancel_at            timestamptz,
  cancelled_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
-- One live subscription per gym.
create unique index if not exists platform_subscriptions_one_live_idx
  on platform.platform_subscriptions(gym_id)
  where status in ('trialing', 'active', 'past_due');
create index if not exists platform_subscriptions_status_idx on platform.platform_subscriptions(status);
create index if not exists platform_subscriptions_period_idx on platform.platform_subscriptions(current_period_end);
create index if not exists platform_subscriptions_trial_idx  on platform.platform_subscriptions(trial_ends_at);

-- -----------------------------------------------------------------------------
-- platform_invoices — what a GYM owes the platform. Paystack (D-020).
--   >>> NO MEMBER PAYMENT EVER APPEARS IN THIS TABLE. <<<
-- status: draft | issued | paid | overdue | void | refunded
-- -----------------------------------------------------------------------------
create table if not exists platform.platform_invoices (
  id              uuid primary key default gen_random_uuid(),
  gym_id          uuid not null references platform.gyms(id) on delete restrict,
  subscription_id uuid references platform.platform_subscriptions(id) on delete set null,
  number          citext unique not null,
  status          text not null default 'draft',
  amount_cents    integer not null,
  currency        text not null default 'ZAR',
  issued_at       timestamptz,
  due_at          timestamptz,
  paid_at         timestamptz,
  provider        text,                   -- 'paystack'
  provider_ref    text,
  -- The billing period this invoice covers. THE DOUBLE-CHARGE GUARD KEYS ON
  -- THIS: one invoice per gym per period, enforced by the unique index below,
  -- so a cron that fires twice cannot bill twice.
  period_end      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists platform_invoices_gym_idx    on platform.platform_invoices(gym_id);
create index if not exists platform_invoices_status_idx on platform.platform_invoices(status);
create index if not exists platform_invoices_due_idx    on platform.platform_invoices(due_at);
-- The guard itself. A second run for the same period is rejected by the
-- database, not merely by the application remembering to check.
create unique index if not exists platform_invoices_one_per_period_idx
  on platform.platform_invoices(gym_id, period_end)
  where period_end is not null;

-- -----------------------------------------------------------------------------
-- member_directory — "I don't remember which gym I joined".
--
-- D-041 stands: the member normally PICKS THEIR GYM FIRST and signs in exactly
-- as they always have. This table serves only the recovery path, for someone
-- who cannot remember.
--
--   >>> IT HOLDS NO MEMBER DATA. <<<
--
-- One keyed digest and one gym id. No name, no readable phone, no membership
-- number, nothing anybody could be identified from. The gym remains the
-- responsible party for its own members (D-014), and a routing index must
-- never become a shadow copy of every gym's membership (D-044).
--
-- The digest is an HMAC with a server-side key, NOT a plain hash. A membership
-- number is about a million possibilities and a phone number is knowable, so a
-- plain-hash table plus somebody's phone would reveal which gym they attend in
-- seconds. The key lives in the environment and never in this table.
-- -----------------------------------------------------------------------------
create table if not exists platform.member_directory (
  lookup_hash text primary key,
  gym_id      uuid not null references platform.gyms(id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index if not exists member_directory_gym_idx on platform.member_directory(gym_id);

-- -----------------------------------------------------------------------------
-- platform_audit_log — APPEND-ONLY.
-- The only record of approvals, suspensions, secret access and deletions. No
-- handler may offer an update or delete path.
-- -----------------------------------------------------------------------------
create table if not exists platform.platform_audit_log (
  id            uuid primary key default gen_random_uuid(),
  actor_user_id uuid references platform.platform_users(id) on delete set null,
  actor_kind    text not null default 'platform_staff',  -- platform_staff | gym_owner | system
  action        text not null,   -- application.approved | gym.suspended | secret.rotated | migration.failed
  entity        text,
  entity_id     uuid,
  detail        jsonb,
  ip_address    inet,
  user_agent    text,
  created_at    timestamptz not null default now()
);
create index if not exists platform_audit_created_idx on platform.platform_audit_log(created_at desc);
create index if not exists platform_audit_actor_idx   on platform.platform_audit_log(actor_user_id);
create index if not exists platform_audit_entity_idx  on platform.platform_audit_log(entity, entity_id);
create index if not exists platform_audit_action_idx  on platform.platform_audit_log(action);

-- -----------------------------------------------------------------------------
-- migration_runs — one row per migration, per gym, per attempt.
-- N databases means N migration runs, and partial failure is the NORMAL case at
-- this scale, not the exception. `checksum` detects drift between what actually
-- ran and what is in git.
-- status: pending | running | succeeded | failed | skipped | rolled_back
-- -----------------------------------------------------------------------------
create table if not exists platform.migration_runs (
  id           uuid primary key default gen_random_uuid(),
  gym_id       uuid not null references platform.gyms(id) on delete cascade,
  migration_id text not null,             -- filename, e.g. 2026-06-27-apply-all.sql
  checksum     text not null,             -- sha256 of the migration file
  status       text not null default 'pending',
  attempt      integer not null default 1,
  started_at   timestamptz,
  finished_at  timestamptz,
  error        text,
  applied_by   text,                      -- 'orchestrator' | a user id
  created_at   timestamptz not null default now(),
  unique (gym_id, migration_id, attempt)
);
create index if not exists migration_runs_status_idx on platform.migration_runs(status);
create index if not exists migration_runs_gym_mig_idx on platform.migration_runs(gym_id, migration_id);
create index if not exists migration_runs_mig_idx    on platform.migration_runs(migration_id);

-- =============================================================================
-- RLS: enabled everywhere, NO policies -> default-deny for anon/authenticated.
-- The platform server uses the service-role key, exactly as the gym app does.
-- This is the same posture as db/schema.sql and is deliberate, not an oversight.
-- =============================================================================
alter table platform.platform_users            enable row level security;
alter table platform.platform_roles            enable row level security;
alter table platform.platform_permissions      enable row level security;
alter table platform.platform_role_permissions enable row level security;
alter table platform.platform_user_roles       enable row level security;
alter table platform.gym_applications          enable row level security;
alter table platform.application_documents     enable row level security;
alter table platform.application_events        enable row level security;
alter table platform.gyms                      enable row level security;
alter table platform.owner_activations         enable row level security;
alter table platform.gym_connections           enable row level security;
alter table platform.gym_secrets               enable row level security;
alter table platform.platform_plans            enable row level security;
alter table platform.platform_subscriptions    enable row level security;
alter table platform.platform_invoices         enable row level security;
alter table platform.platform_audit_log        enable row level security;
alter table platform.migration_runs            enable row level security;
