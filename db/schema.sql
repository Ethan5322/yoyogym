-- =============================================================================
-- PREMIUM AI GYM SYSTEM — DATABASE SCHEMA  (Supabase / PostgreSQL)
-- MuleSoo Digital Solutions
-- =============================================================================
-- This is the version-controlled, repeatable schema used to stand up a NEW gym
-- tenant (one Supabase project per gym). It is reconstructed from the
-- application code and is the *minimal complete* schema the code reads/writes.
--
-- HOW TO USE (new tenant):
--   1. Open Supabase → SQL Editor → paste this whole file → Run.
--   2. Then run the seeds:   npm run seed:owner   &&   npm run seed:catalog
--
-- KEEPING IT IN SYNC WITH A LIVE DB:
--   For a byte-exact dump of an existing production gym, prefer:
--       supabase db dump --schema gym -f db/schema.live.sql
--   and commit that alongside this file. See db/README.md.
--
-- DESIGN NOTES:
--   • All app tables live in the `gym` schema (matches SUPABASE_SCHEMA=gym).
--   • The server uses the SERVICE ROLE key, which bypasses RLS. We still ENABLE
--     RLS on every table with NO policies → default-deny for anon/auth roles
--     (POPIA requirement: browser/clients can never read personal data directly).
--   • Member-owned tables cascade on member delete (POPIA right to erasure).
--   • Status/category fields are plain text (documented inline) for forward
--     compatibility — add CHECK constraints later if you want them enforced.
-- =============================================================================

create schema if not exists gym;
create extension if not exists pgcrypto;   -- gen_random_uuid()

set search_path = gym, public;

-- -----------------------------------------------------------------------------
-- admin_users — staff accounts & RBAC (spec 4.1)
-- role: owner | manager | reception | trainer
-- -----------------------------------------------------------------------------
create table if not exists gym.admin_users (
  id                uuid primary key default gen_random_uuid(),
  username          text unique not null,
  email             text,
  password_hash     text not null,            -- bcrypt
  full_name         text,
  role              text not null default 'reception',
  trainer_id        uuid,                      -- links a 'trainer' login to gym.trainers
  is_active         boolean not null default true,
  face_descriptor   jsonb,                     -- admin face-login (Phase 88)
  -- Staff credential (ID card + verify QR), set when an owner registers staff:
  staff_number      text unique,               -- STF-YYYY-XXXXXX
  verification_code text,                       -- 8-char access/verify code
  job_title         text,                       -- e.g. Manager, Receptionist
  phone             text,
  photo_url         text,                       -- passport photo for the ID card
  failed_logins     integer not null default 0,
  locked_until      timestamptz,
  last_login_at     timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- trainers — trainer profiles (spec 4.8)
-- -----------------------------------------------------------------------------
create table if not exists gym.trainers (
  id                uuid primary key default gen_random_uuid(),
  full_name         text not null,
  phone             text,
  email             text,
  specialization    text,
  certifications    text,
  bio               text,
  face_descriptor   jsonb,
  photo_url         text,                        -- passport photo for the ID card
  trainer_number    text unique,                 -- TRN-YYYY-XXXXXX
  verification_code text,                         -- 8-char verify code
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- admin_users.trainer_id → trainers (added after trainers exists)
alter table gym.admin_users
  drop constraint if exists admin_users_trainer_id_fkey;
alter table gym.admin_users
  add constraint admin_users_trainer_id_fkey
  foreign key (trainer_id) references gym.trainers(id) on delete set null;

-- -----------------------------------------------------------------------------
-- plans — membership tiers, session packs, day pass, trial (spec 2.5 / 4.13)
-- visit_type: full | session_pack | day_pass | trial
-- classes_included: -1 = unlimited, 0 = none
-- -----------------------------------------------------------------------------
create table if not exists gym.plans (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  tier                text,                    -- basic | standard | premium | vip
  visit_type          text not null default 'full',
  description         text,
  benefits            jsonb default '[]'::jsonb,
  monthly_price       numeric(10,2),
  joining_fee         numeric(10,2) default 0,
  classes_included    integer default 0,
  pt_sessions_incl    integer default 0,
  is_featured         boolean not null default false,
  is_enabled          boolean not null default true,
  session_pack_size   integer,
  session_pack_price  numeric(10,2),
  day_pass_price      numeric(10,2),
  trial_days          integer,
  trial_price         numeric(10,2),
  sort_order          integer default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- addon_services — optional extras (spec 2.6 step 6 / 4.13)
-- billing_type: once_off | per_session | monthly
-- category: personal_training | class | additional
-- -----------------------------------------------------------------------------
create table if not exists gym.addon_services (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  category      text,
  description   text,
  price         numeric(10,2) not null default 0,
  billing_type  text default 'monthly',
  is_enabled    boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- members — complete member profiles (spec 2.3 / 4.4)
-- status: new | active | expiring | lapsed | suspended
-- -----------------------------------------------------------------------------
create table if not exists gym.members (
  id                   uuid primary key default gen_random_uuid(),
  membership_number    text unique not null,           -- GYM-YYYY-XXXXXX
  verification_code    text unique not null,
  full_name            text not null,
  date_of_birth        date,
  gender               text,                            -- male | female | prefer_not_to_say
  id_number            text,                            -- SA ID (or null)
  passport_number      text,                            -- passport (or null)
  phone                text,
  email                text,
  address_street       text,
  address_suburb       text,
  address_city         text,
  address_postal_code  text,
  emergency_name       text,
  emergency_phone      text,
  guardian_consent     boolean default false,           -- true when registered under 18
  fitness_goals        jsonb default '[]'::jsonb,
  experience_level     text,
  training_frequency   text,                            -- 1_2 | 3_4 | 5_6 | daily
  preferred_time       text,
  injuries_notes       text,
  has_medical_aid      boolean default false,
  medical_aid_provider text,
  status               text not null default 'new',
  parq_flag            boolean not null default false,  -- medical clearance required
  manually_registered  boolean not null default false,
  staff_notes          text,
  photo_url            text,
  face_descriptor      jsonb,                            -- biometric (Phase 88)
  biometric_enrolled   boolean not null default false,
  popia_consent_at     timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists members_status_idx        on gym.members(status);
create index if not exists members_full_name_idx      on gym.members(full_name);
create index if not exists members_phone_idx          on gym.members(phone);
create index if not exists members_email_idx          on gym.members(email);

-- -----------------------------------------------------------------------------
-- memberships — active & historical membership plans per member (spec 3.2)
-- state: active | expiring | expired | cancelled
-- contract_duration: month_to_month | 3_month | 6_month | 12_month
-- -----------------------------------------------------------------------------
create table if not exists gym.memberships (
  id                    uuid primary key default gen_random_uuid(),
  member_id             uuid not null references gym.members(id) on delete cascade,
  plan_id               uuid references gym.plans(id),
  visit_type            text,
  tier                  text,
  contract_duration     text,
  state                 text not null default 'active',
  start_date            date,
  end_date              date,
  monthly_amount        numeric(10,2),
  joining_fee           numeric(10,2),
  contract_value        numeric(10,2),
  sessions_total        integer,
  sessions_remaining    integer,
  billing_day           integer,
  next_billing_date     date,
  indemnity_accepted_at timestamptz,
  contract_accepted_at  timestamptz,
  digital_signature     text,
  terms_version         text,
  paystack_auth_code    text,                  -- saved card auth for recurring debit
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists memberships_member_idx       on gym.memberships(member_id);
create index if not exists memberships_state_idx        on gym.memberships(state);
create index if not exists memberships_next_billing_idx on gym.memberships(next_billing_date);

-- -----------------------------------------------------------------------------
-- parq_responses — PAR-Q health screening per member (spec 2.3 step 3)
-- -----------------------------------------------------------------------------
create table if not exists gym.parq_responses (
  id                    uuid primary key default gen_random_uuid(),
  member_id             uuid not null references gym.members(id) on delete cascade,
  q1_heart_condition    boolean default false,
  q2_chest_pain_activity boolean default false,
  q3_chest_pain_rest    boolean default false,
  q4_dizziness_balance  boolean default false,
  q5_bone_joint_problem boolean default false,
  q6_bp_heart_meds      boolean default false,
  q7_other_reason       boolean default false,
  any_yes               boolean default false,
  clearance_required    boolean default false,
  medical_clearance_url text,                  -- uploaded doctor's note (if flagged)
  created_at            timestamptz not null default now()
);
create index if not exists parq_member_idx on gym.parq_responses(member_id);

-- -----------------------------------------------------------------------------
-- member_addons — add-ons each member has purchased (spec 4.4)
-- -----------------------------------------------------------------------------
create table if not exists gym.member_addons (
  id                 uuid primary key default gen_random_uuid(),
  member_id          uuid not null references gym.members(id) on delete cascade,
  membership_id      uuid references gym.memberships(id) on delete set null,
  addon_id           uuid references gym.addon_services(id),
  price_at_purchase  numeric(10,2),
  billing_type       text,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now()
);
create index if not exists member_addons_member_idx on gym.member_addons(member_id);

-- -----------------------------------------------------------------------------
-- payments — all transactions (spec 3.1 / 4.9)
-- category: joining_fee | monthly_fee | session_pack | day_pass | other
-- status:   pending | received | failed | refunded
-- -----------------------------------------------------------------------------
create table if not exists gym.payments (
  id                  uuid primary key default gen_random_uuid(),
  member_id           uuid references gym.members(id) on delete cascade,
  membership_id       uuid references gym.memberships(id) on delete set null,
  category            text,
  amount              numeric(10,2) not null,
  currency            text not null default 'ZAR',
  status              text not null default 'pending',
  method              text,                    -- paystack | paystack_debit | cash | eft
  description         text,
  paystack_reference  text,
  paid_at             timestamptz,
  retry_count         integer not null default 0,
  next_retry_at       timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists payments_member_idx on gym.payments(member_id);
create index if not exists payments_status_idx on gym.payments(status);
create index if not exists payments_paid_at_idx on gym.payments(paid_at);

-- -----------------------------------------------------------------------------
-- checkins — attendance log (spec 4.3 / 4.6 / 4.10 + Phase 99 access)
-- method: verification | face | self | manual
-- compliance: ok | extra | violation     approved: null=pending, true/false
-- -----------------------------------------------------------------------------
create table if not exists gym.checkins (
  id              uuid primary key default gen_random_uuid(),
  member_id       uuid not null references gym.members(id) on delete cascade,
  method          text,
  verified_by     uuid references gym.admin_users(id) on delete set null,
  station_id      text,                        -- multi-door (Phase 99)
  compliance      text default 'ok',
  approved        boolean,
  checked_in_at   timestamptz not null default now(),
  checked_out_at  timestamptz
);
create index if not exists checkins_member_idx  on gym.checkins(member_id);
create index if not exists checkins_in_at_idx    on gym.checkins(checked_in_at);

-- -----------------------------------------------------------------------------
-- classes — class schedule & details (spec 4.7)
-- recurrence: recurring | one_off    day_of_week: 0=Sun .. 6=Sat (for recurring)
-- allowed_tiers: jsonb array of tier strings (empty = all tiers)
-- -----------------------------------------------------------------------------
create table if not exists gym.classes (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  trainer_id        uuid references gym.trainers(id) on delete set null,
  recurrence        text default 'recurring',
  day_of_week       integer,
  start_time        time,
  class_date        date,                      -- for one-off classes
  duration_minutes  integer,
  max_capacity      integer default 20,
  min_capacity      integer default 0,
  require_booking   boolean not null default true,
  allowed_tiers     jsonb default '[]'::jsonb,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- class_bookings — which members booked which classes (spec 3.3)
-- status: booked | waitlisted | cancelled | attended
-- -----------------------------------------------------------------------------
create table if not exists gym.class_bookings (
  id                 uuid primary key default gen_random_uuid(),
  class_id           uuid not null references gym.classes(id) on delete cascade,
  member_id          uuid not null references gym.members(id) on delete cascade,
  session_date       date not null,
  status             text not null default 'booked',
  waitlist_position  integer,
  reminder_sent      boolean not null default false,
  booked_at          timestamptz default now(),
  cancelled_at       timestamptz,
  created_at         timestamptz not null default now(),
  unique (class_id, member_id, session_date)
);
create index if not exists class_bookings_class_date_idx on gym.class_bookings(class_id, session_date);
create index if not exists class_bookings_member_idx     on gym.class_bookings(member_id);

-- -----------------------------------------------------------------------------
-- training_sessions — personal-training session records (spec 4.8)
-- -----------------------------------------------------------------------------
create table if not exists gym.training_sessions (
  id             uuid primary key default gen_random_uuid(),
  member_id      uuid not null references gym.members(id) on delete cascade,
  trainer_id     uuid references gym.trainers(id) on delete set null,
  workout_notes  text,
  completed      boolean not null default false,
  scheduled_at   timestamptz,
  completed_at   timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists training_sessions_member_idx  on gym.training_sessions(member_id);
create index if not exists training_sessions_trainer_idx on gym.training_sessions(trainer_id);

-- -----------------------------------------------------------------------------
-- notifications_log — every notification attempt (spec 4.12 / Part 5)
-- channel: email | whatsapp | telegram
-- -----------------------------------------------------------------------------
create table if not exists gym.notifications_log (
  id             uuid primary key default gen_random_uuid(),
  member_id      uuid references gym.members(id) on delete set null,
  recipient      text,
  channel        text,
  template_key   text,
  subject        text,
  body           text,
  status         text,                          -- sent | failed
  is_owner_alert boolean not null default false,
  error_message  text,
  sent_at        timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists notifications_member_idx on gym.notifications_log(member_id);

-- -----------------------------------------------------------------------------
-- settings — all gym configuration (spec 4.13). Keyed by `key`.
-- Known keys: gym_profile, notifications, notification_toggles,
--             contract_discounts, compliance, legal_terms, parq_settings ...
-- -----------------------------------------------------------------------------
create table if not exists gym.settings (
  key         text primary key,
  category    text,
  value       jsonb not null default '{}'::jsonb,
  updated_by  uuid references gym.admin_users(id) on delete set null,
  updated_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- qr_scan_analytics — QR scan tracking (spec 2.1 / 4.10)
-- qr_type: new_member | existing_member
-- -----------------------------------------------------------------------------
create table if not exists gym.qr_scan_analytics (
  id          uuid primary key default gen_random_uuid(),
  qr_type     text,
  user_agent  text,
  ip_address  text,
  created_at  timestamptz not null default now()
);
create index if not exists qr_scan_created_idx on gym.qr_scan_analytics(created_at);

-- -----------------------------------------------------------------------------
-- events — calendar events, promotions & blocked days (spec 4.11)
-- type: event | promotion | blocked | class ...
-- -----------------------------------------------------------------------------
create table if not exists gym.events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  type        text,
  event_date  date not null,
  end_date    date,
  start_time  time,
  description text,
  created_by  uuid references gym.admin_users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists events_date_idx on gym.events(event_date);

-- -----------------------------------------------------------------------------
-- visitors — guest / day-pass management (Phase 99)
-- -----------------------------------------------------------------------------
create table if not exists gym.visitors (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  phone          text,
  host_name      text,
  pass_code      text,
  valid_date     date,
  checked_in_at  timestamptz,
  created_by     uuid references gym.admin_users(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists visitors_valid_date_idx on gym.visitors(valid_date);

-- -----------------------------------------------------------------------------
-- incidents — security incident log (Phase 99)
-- -----------------------------------------------------------------------------
create table if not exists gym.incidents (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid references gym.members(id) on delete set null,
  person_label  text,                           -- for unidentified persons
  note          text not null,
  admin_id      uuid references gym.admin_users(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists incidents_created_idx on gym.incidents(created_at);

-- -----------------------------------------------------------------------------
-- audit_log — record of important staff actions (accountability / compliance)
-- -----------------------------------------------------------------------------
create table if not exists gym.audit_log (
  id          uuid primary key default gen_random_uuid(),
  admin_id    uuid references gym.admin_users(id) on delete set null,
  admin_name  text,
  action      text not null,                 -- e.g. member.status, payment.refund
  entity      text,                          -- member | payment | settings | admin_user
  entity_id   text,
  detail      text,
  created_at  timestamptz not null default now()
);
create index if not exists audit_created_idx on gym.audit_log(created_at);

-- =============================================================================
-- ROW LEVEL SECURITY — enable on every table (default-deny; service role bypasses)
-- =============================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'admin_users','trainers','plans','addon_services','members','memberships',
    'parq_responses','member_addons','payments','checkins','classes',
    'class_bookings','training_sessions','notifications_log','settings',
    'qr_scan_analytics','events','visitors','incidents','audit_log'
  ]
  loop
    execute format('alter table gym.%I enable row level security;', t);
  end loop;
end $$;

-- No policies are created intentionally: with RLS enabled and no policy, all
-- access by the anon/authenticated roles is denied. The app connects with the
-- SERVICE ROLE key, which bypasses RLS. Add policies only if you later expose
-- tables to the anon/auth roles directly.

-- =============================================================================
-- END OF SCHEMA
-- =============================================================================
