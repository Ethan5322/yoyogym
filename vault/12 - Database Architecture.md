---
aliases: ["Database Architecture", "Database Design", "Platform Data Model"]
tags: [database, architecture, stage-3, proposed]
stage: "Stage 3 — CLOSED"
status: "existing = confirmed · platform = APPROVED (D-022), not yet built"
updated: 2026-09-21
---

# 12 — Database Architecture

> **Two halves, two statuses.**
> §1–§3 describe the **existing single-gym database** — confirmed, unchanged, **not modified by
> Stage 3**.
> §4 onward is the **approved platform data model** — ✅ **Stage 3 gate closed 2026-09-21 (D-022)**.
> The design is approved; **the tables are NOT created. No migration exists and no SQL has been
> run.** Building them is later-stage work. The approved conditions in D-022 are binding on every
> implementation: no member data in the platform schema, `gym_secrets` holds references only,
> resolution fails closed, no default-gym fallback, platform and gym roles stay separate.

---

## 1. Existing single-gym database — confirmed, untouched

Supabase PostgreSQL, single schema **`gym`**, **24 tables**, server-side only via the service-role
key. RLS enabled on every table with **zero policies** → default-deny. **[C]**

13 migrations in `db/migrations/`, latest `2026-07-11-international-members.sql`. Every
migration-created table also appears in `schema.sql`.

### Relationship map

```text
members ─┬─< memberships ──> plans
         ├─< parq_responses
         ├─< member_addons ──> addon_services, memberships
         ├─< payments ──> memberships
         ├─< checkins ──> admin_users (verified_by)
         ├─< class_bookings ──> classes ──> trainers
         ├─< training_sessions ──> trainers
         ├─< progress_entries
         ├─< referrals (referrer_member_id)
         ├─< admin_inbox (self-referencing parent_id → threads)
         ├─< notifications_log
         └─< incidents ──> admin_users

admin_users ──> trainers (trainer_id)
admin_users ─< announcements, settings, events, visitors, audit_log
```

Member-owned rows `cascade` (POPIA erasure); staff references `set null` (preserve history). **[C]**

### The `settings` table — Q-27

Free-form key/value store: `{ key unique, value jsonb, category, updated_by, updated_at }`, upsert
on conflict. **No enumerated key list, no key validation.** Keys confirmed in use: `gym_profile`,
`contract_discounts`, `compliance`. **[P]**

### Storage facts

- **No object storage.** `members.photo_url` is text; face templates are `jsonb`
  (`face_descriptor`, `face_templates` 128-D; `arcface_embedding`, `arcface_templates` 512-D, empty). **[C]**
- `membership_number` is `unique` **within one gym's database only**. **[C]**

---

## 2. What Stage 3 does NOT do

Per the user's Stage 3 instruction and `CLAUDE.md` §32:

- The **24 existing tables are not modified**. No column added, renamed or dropped.
- **No migration file is created.** No SQL is executed anywhere.
- **No `gym_id` is added to any existing table** — and under D-016 none ever will be, because each
  gym keeps its own database.
- Paystack is **not** removed yet (that is D-015/018, a separate approved stage).
- Authentication is not changed; the platform admin panel is not built.

---

## 3. Where the platform data lives

Under **D-016** the platform is a **separate Supabase project** with its own schema, `platform`.
It never shares a database with any gym.

```text
┌─────────────────────────────┐
│  PLATFORM Supabase project  │   schema: platform   (proposed, §4)
│  registry · applications ·  │   one database, all gyms' METADATA
│  subscriptions · audit      │   never holds member data
└──────────────┬──────────────┘
               │ gym_connections + gym_secrets (references only)
   ┌───────────┼───────────┬───────────────┐
   ▼           ▼           ▼               ▼
┌───────┐  ┌───────┐  ┌───────┐        ┌───────┐
│ Gym 1 │  │ Gym 2 │  │ Gym 3 │  ...   │ Gym N │   each: its own Supabase
│ gym   │  │ gym   │  │ gym   │        │ gym   │   project, schema `gym`,
│ 24 tbl│  │ 24 tbl│  │ 24 tbl│        │ 24 tbl│   24 tables, UNCHANGED
└───────┘  └───────┘  └───────┘        └───────┘
```

**The platform database holds no member data.** No names, no health answers, no biometric
templates, no payments. That property is what keeps the POPIA position from D-014 intact, and it
should be treated as an invariant, not a convention.

---

## 4. Proposed platform tables (14)

All in schema `platform`. Conventions follow the existing codebase: `uuid` primary keys with
`gen_random_uuid()`, `created_at`/`updated_at` as `timestamptz not null default now()`, status
fields as plain `text` documented inline (matching `schema.sql`'s stated design note), RLS enabled
with **no policies** (default-deny; the platform server uses a service-role key exactly as the gym
app does).

### 4.1 Identity and access

**`platform_users`** — platform-side identities. **A separate namespace from every gym's
`admin_users`.** A gym owner has a row here *and* an `owner` row in their own gym database; they are
different records and must never be conflated.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `email` | citext **unique not null** | login identifier |
| `password_hash` | text | bcrypt, same cost as the gym app |
| `full_name` | text | |
| `kind` | text not null | `platform_staff` \| `gym_owner` |
| `is_active` | boolean not null default true | |
| `failed_logins` | int not null default 0 | mirrors the gym app's hardening |
| `locked_until` | timestamptz | 5 attempts → 15 min |
| `last_login_at` | timestamptz | |
| `created_at` / `updated_at` | timestamptz | |

**`platform_roles`** — `id`, `key` citext unique, `label`, `description`.
**`platform_permissions`** — `id`, `key` citext unique, `label`.
**`platform_role_permissions`** — `role_id` → roles, `permission_id` → permissions, **PK (role_id, permission_id)**.
**`platform_user_roles`** — `user_id` → users, `role_id` → roles, `granted_by`, `granted_at`, **PK (user_id, role_id)**.

Roles and permissions are **data, not code** — the same rule §18 sets for subscription tiers.

### 4.2 Registry

**`gyms`** — the registry, and the anchor of the whole model.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `slug` | citext **unique not null** | routing key — subdomain / path segment |
| `legal_name` / `trading_name` | text | |
| `status` | text not null default `'pending'` | `pending` \| `approved` \| `provisioning` \| `active` \| `suspended` \| `terminated` \| `rejected` |
| `owner_user_id` | uuid → `platform_users(id)` on delete restrict | a gym must never be orphaned |
| `application_id` | uuid → `gym_applications(id)` on delete set null | provenance |
| `country` / `city` / `timezone` | text | |
| `latitude` / `longitude` | numeric | **D-065** — powers "gyms near me" in app search. Index for proximity queries; PostGIS only if simple distance proves insufficient |
| `search_name` | text | normalised gym name for matching; `slug` is the routing key, this is the human one |
| `activated_at` / `suspended_at` / `terminated_at` | timestamptz | **D-027: suspension never deprovisions.** The gym's Supabase project and data survive a suspension untouched; reactivation is a status change, not a re-provision |
| `created_at` / `updated_at` | timestamptz | |

### 4.3 Onboarding

**`gym_applications`** — `id`, `applicant_user_id` → platform_users, `status`
(`draft` \| `submitted` \| `under_review` \| `info_requested` \| `approved` \| `rejected` \| `withdrawn`),
`proposed_gym_name`, `country`, `city`, `estimated_members`, `submitted_at`, `decided_at`,
`decided_by` → platform_users, `decision_reason`, `review_notes`, timestamps.

**`application_documents`** — `id`, `application_id` → applications **on delete cascade**,
`doc_type` text, **`storage_ref` text** (a pointer — the file itself lives in object storage that
**does not exist yet**, Q-24), `filename`, `mime_type`, `size_bytes`, `sha256`, `status`
(`pending` \| `accepted` \| `rejected`), `reviewed_by`, `reviewed_at`, `reject_reason`,
`uploaded_at`, **`retention_until` date** (POPIA retention, Q-12).

**`application_events`** — the approval/rejection history. **Append-only; never updated or deleted.**
`id`, `application_id` → applications cascade, `event` (`submitted` \| `info_requested` \|
`approved` \| `rejected` \| `withdrawn` \| `document_accepted` \| `document_rejected`),
`actor_user_id` → platform_users on delete set null, `reason`, `detail` jsonb, `created_at`.

**`owner_activations`** — the verification link + code step in [[07 - Owner Workflows]].
`id`, `user_id` → platform_users cascade, `gym_id` → gyms cascade, **`token_hash`**, **`code_hash`**,
`expires_at`, `used_at`, `created_at`. **Hashes only — never the raw token or code**, exactly as the
gym app stores password hashes rather than passwords.

### 4.4 Connection and secrets — the heart of D-016

**`gym_connections`** — how the platform reaches one gym's Supabase project.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `gym_id` | uuid → `gyms(id)` on delete cascade | |
| `supabase_project_ref` | text not null | project ref, **not a key** |
| `supabase_url` | text not null | |
| `db_region` | text | |
| `schema_name` | text not null default `'gym'` | matches `SUPABASE_SCHEMA` |
| `app_base_url` | text | the gym's public URL |
| `schema_version` | text | last migration applied — see §4.6 |
| `status` | text not null default `'provisioning'` | `provisioning` \| `healthy` \| `degraded` \| `unreachable` \| `retired` |
| `last_health_check_at` | timestamptz | drives `/api/health` polling |
| `last_health_status` | text | |
| `created_at` / `updated_at` | timestamptz | |

Constraint: **partial unique index on `gym_id` where `status <> 'retired'`** — at most one live
connection per gym, while retired rows stay for history.

**`gym_secrets`** — **references only.**

`id`, `gym_id` → gyms cascade, `key_name` text (`SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`,
`BREVO_API_KEY`, `PAYSTACK_SECRET_KEY`…), **`secret_ref` text not null** (path/ARN/id in the
external store), `version` int not null default 1, `rotated_at`, `rotates_at`, `created_at`.
**Unique (gym_id, key_name, version).**

> ### 🔒 Invariant — no secret value is ever stored in this database
> `gym_secrets` holds **pointers**. A database constraint cannot enforce "this text is not a
> secret", so this is a **documented invariant plus a code-review rule**, and it belongs in the
> Stage 3 gate checklist. If a secret value is ever found in this table, treat it as an incident:
> rotate it, do not merely delete the row.

### 4.5 Commercial

**`platform_plans`** — tiers as data (§18: never hard-code limits or prices).
`id`, `key` citext unique (`basic` \| `medium` \| `prime`), `label`, `description`,
**`max_active_members` int**, `max_locations` int default 1, **`features` jsonb** (the feature-gate
map), `price_cents` int, `currency` char(3), `billing_interval` (`month` \| `year`),
`is_enabled` boolean, timestamps.

**`platform_subscriptions`** — `id`, `gym_id` → gyms cascade, `plan_id` → platform_plans on delete
restrict, `status` (`trialing` \| `active` \| `past_due` \| `suspended` \| `cancelled` \| `expired`),
`trial_ends_at`, `current_period_start`, `current_period_end`, **`grace_ends_at`** (the D-026
2-day warning window — data, never a hard-coded constant), `cancel_at`, `cancelled_at`, timestamps. Partial unique on `gym_id` where status in (`trialing`,`active`,`past_due`) — one live
subscription per gym.

**`platform_invoices`** — billing status. `id`, `gym_id` → gyms, `subscription_id` → subscriptions
on delete set null, `number` citext unique, `status` (`draft` \| `issued` \| `paid` \| `overdue` \|
`void` \| `refunded`), `amount_cents`, `currency`, `issued_at`, `due_at`, `paid_at`,
`provider` text, `provider_ref` text, timestamps.

> This bills **gyms**, never members (D-013). No member ever appears in these tables. The provider
> for gym subscriptions is **undecided** — Paystack is the gym-side member tool and its removal
> (D-018) is unrelated to platform billing.

### 4.6 Operations

**`platform_audit_log`** — **append-only.** `id`, `actor_user_id` → platform_users on delete set
null, `actor_kind` (`platform_staff` \| `gym_owner` \| `system`), `action` text
(`application.approved`, `gym.suspended`, `secret.rotated`, `migration.failed`…), `entity`,
`entity_id` uuid, `detail` jsonb, `ip_address` inet, `user_agent` text, `created_at`.

**`migration_runs`** — one row per migration per gym per attempt.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `gym_id` | uuid → gyms cascade | |
| `migration_id` | text not null | filename, e.g. `2026-06-27-apply-all.sql` |
| `checksum` | text not null | sha256 of the file — **detects drift between what ran and what is in git** |
| `status` | text not null | `pending` \| `running` \| `succeeded` \| `failed` \| `skipped` \| `rolled_back` |
| `attempt` | int not null default 1 | |
| `started_at` / `finished_at` | timestamptz | |
| `error` | text | |
| `applied_by` | text | `orchestrator` \| a user id |

**Unique (gym_id, migration_id, attempt).**

---

## 5. Relationships

```text
platform_users ─┬─< platform_user_roles >─ platform_roles ─< platform_role_permissions >─ platform_permissions
                ├─< gym_applications (applicant)
                ├─< owner_activations
                └──> gyms (owner_user_id, restrict)

gym_applications ─┬─< application_documents   (cascade)
                  ├─< application_events      (cascade, append-only)
                  └──> gyms (application_id, set null)

gyms ─┬─< gym_connections     (cascade)  ← one live per gym
      ├─< gym_secrets         (cascade)  ← references only
      ├─< platform_subscriptions (cascade) → platform_plans
      ├─< platform_invoices   (restrict — never delete a gym with invoices)
      ├─< migration_runs      (cascade)
      └─< owner_activations   (cascade)

platform_audit_log → platform_users (set null)   ← never cascade; history outlives people
```

**Deletion policy, deliberate:** `restrict` on `gyms.owner_user_id` and on invoices (financial and
ownership records must not vanish); `set null` on audit and decision actors (history outlives
staff); `cascade` only from a gym or an application to its own dependent rows. This mirrors the
existing gym schema's reasoning.

## 6. Keys and indexes

| Table | Unique | Index |
|---|---|---|
| `platform_users` | `email` | `kind`, `is_active` |
| `gyms` | **`slug`** | `status`, `owner_user_id`, `country` |
| `gym_applications` | — | `status`, `applicant_user_id`, `submitted_at desc` |
| `application_documents` | — | `application_id`, `status` |
| `application_events` | — | `application_id`, `created_at desc` |
| `gym_connections` | **partial: `gym_id` where status <> 'retired'** | `status`, `supabase_project_ref`, `last_health_check_at` |
| `gym_secrets` | `(gym_id, key_name, version)` | `gym_id`, `rotates_at` |
| `platform_plans` | `key` | `is_enabled` |
| `platform_subscriptions` | **partial: `gym_id` where status in (trialing,active,past_due)** | `status`, `current_period_end` |
| `platform_invoices` | `number` | `gym_id`, `status`, `due_at` |
| `platform_audit_log` | — | `created_at desc`, `actor_user_id`, `(entity, entity_id)`, `action` |
| `migration_runs` | `(gym_id, migration_id, attempt)` | `status`, `(gym_id, migration_id)`, `migration_id` |
| `owner_activations` | — | `user_id`, `expires_at` |

**`gyms.slug` is the single most load-bearing index in the platform** — it is on the hot path of
every request (§7).

## 7. Secret-handling flow

```text
1. Resolver needs gym G's database client
2. Read gym_secrets rows for G  →  secret_ref pointers (NO values in the DB)
3. Fetch values from the external secrets store by ref
4. Hold in memory, per-gym, with a short TTL; never write to disk, never log,
   never include in an error message or an API response
5. Build the Supabase client; cache the CLIENT, not the raw secret
6. On rotation: write a NEW gym_secrets row (version+1), evict the cached client,
   record `secret.rotated` in platform_audit_log
```

Store choice is **Q-36, open**. Requirement that drives it: Vercel env vars cap at **64 KB total per
deployment** **[V]** — thousands of gyms cannot fit, which is precisely why the store must be
external and fetched at runtime.

## 7b. Secrets-manager comparison — RESEARCH, awaiting approval (D-067)

Researched 2026-09-21 from vendor pricing pages, not from memory.

### The finding that decides it: the pricing MODEL matters more than the vendor

| Vendor | Billed on | Cost at 1,000 gyms | Cost at 10,000 gyms |
|---|---|---|---|
| **AWS Secrets Manager** | **per secret / month** ($0.40 + API calls) | **~$400/mo** | **~$4,000/mo** |
| **Infisical** | **per identity** ($20/identity/mo Pro, annual); **secrets unlimited** | **~$60/mo flat** | **~$60/mo flat** |
| **Doppler** | **per seat** ($21/user/mo Team); non-human identities **free** | ~$21–60/mo flat | ~$21–60/mo flat ⚠️ *see limits* |
| **HashiCorp Vault (HCP)** | cluster-hour + per-client | not published | not published |

**Per-secret pricing scales with gym count. Per-identity pricing does not.** At the target scale
that is not a small difference — it is roughly **$60 a month against $48,000 a year**.

### Why per-identity pricing stays flat here — it is the architecture, not luck

Under D-016 the **shared application** fetches each gym's secrets itself. So the whole platform needs
about **two machine identities**: the gym-serving app, and the migration orchestrator. Gym count does
not change that.

> ⚠️ **This only holds because of how we designed it.** Had each gym been given its own identity,
> Infisical would cost **$20 per gym per month** — worse than AWS. The cheap outcome is a consequence
> of the resolver design, and any future change that gives gyms their own identities **reopens the
> cost question**.

### Vendor notes

- **Infisical** — MIT-licensed core, **free to self-host** with **no limits** on self-hosted
  instances. Free cloud tier covers 5 identities, which may cover early operation at **$0**.
  *Caveat:* supported/licensed self-hosting is a custom negotiation, and it is a younger project.
- **Doppler** — clean model ("non-human identities ride free"), but **structural limits bite**:
  Team allows 250 projects, 100 configs per environment, 500 service tokens. Thousands of gyms do not
  map onto that without Enterprise and custom limits.
- **AWS Secrets Manager** — most mature, strongest audit, but the cost shape is wrong and it drags
  AWS into a stack that currently has none. Perfectly reasonable **below a few hundred gyms**.
- **HCP Vault** — priced per cluster-hour plus per client; exact rates are **not published** and were
  not obtainable. Heaviest operational burden of the four.

### Design rule, whichever vendor is chosen

**Store ONE secret per gym — a single JSON blob** (Supabase URL, service key, `JWT_SECRET`, Brevo,
CallMeBot) rather than five separate entries. It cuts any per-secret cost by ~5×, and it makes
rotation atomic: one write, one version, one cache eviction.

### ✅ DECIDED 2026-09-21 (D-069) — Infisical, FREE TIER, no paid plan

**The plan when the free tier runs out:** self-host the MIT core. Free software, but it needs a host
and someone to run it — that is a real cost in time, not zero. **It is not a surprise bill**, which
is the point: the ceiling is known in advance and the exit is already chosen.

**The risk, stated plainly:** a vendor free tier is a load-bearing production dependency here. Free
tiers change. The MIT self-host path is the mitigation, and is exactly why Infisical was preferred
over AWS, which offers no such exit.

### Recommendation as researched — for the record

**Infisical.** Per-identity pricing that our architecture already keeps at ~2 identities, unlimited
secrets, versioning, rotation and audit, and an MIT core we could self-host if cost or control ever
demanded it — **an exit AWS does not offer**.

**Start on the free tier** (5 identities) and move to Pro when a third machine identity or a second
human is needed. Revisit only if Infisical's maturity becomes a blocker.

**Still to verify before committing:** Infisical's rate limits for per-request secret fetches from
serverless (the resolver will fetch on a cache miss, so this is on the hot path), and whether
machine identities are billed identically to human ones on the plan chosen.

## 8. Migration-run flow

```text
For each migration file in db/migrations/ (ordered):
  compute checksum
  for each gym with connection status 'healthy':
    if migration_runs has (gym, migration, succeeded) with SAME checksum → skip
    if succeeded with a DIFFERENT checksum        → FLAG DRIFT, do not auto-apply
    else:
      insert migration_runs (running, attempt n)
      apply against that gym's database
      update succeeded/failed + error
  report: applied / skipped / failed / drifted, per gym
```

**Partial failure is the normal case at this scale, not the exception.** The orchestrator must be
resumable, idempotent, rate-limited, and must never leave the fleet in an unknown state —
`gym_connections.schema_version` plus `migration_runs` give the central view of who is on which
version that Model A could never provide. Orchestration design is **Q-38, open**.

## 9. Security risks of this model

See [[14 - Security and Privacy]] for the full treatment. The headline, stated plainly:

> **D-016 buys physical *data* isolation at the price of making the *application* a shared trust
> boundary.** Under a deployment-per-gym model, compromising one app reached one gym. Under a
> shared application, the running process can reach every gym's credentials. The data is separate;
> the code path is not.

That is a real, accepted trade-off — not a flaw to be papered over — and it makes the resolver and
the secret cache the two most security-critical pieces of code in the platform.

## 10. Open questions carried by this design

Q-36 secrets store · Q-37 connection pooling · Q-38 migration orchestration ·
**U-1 maximum Supabase projects per organisation** · **U-2 Supabase pricing and operational cost at
target scale** · Q-12 document retention · Q-24 object storage (blocks
`application_documents.storage_ref` being usable) · Q-40 platform billing provider.

## Storage alternatives

If the shared free project is ever outgrown, [[22 - Storage Migration Assessment]] measures what
moving off Supabase would cost — including Telga's Railway + SQLite model, and why the
`getSupabase()` seam keeps that a one-file change rather than a rewrite.

## Related

[[00 - Project Purpose]] · [[01 - Existing Yoyo Gym Audit]] · [[06 - Tenant Architecture]] ·
[[03 - Protected Existing Functions]] · [[13 - Authentication and Roles]] ·
[[14 - Security and Privacy]] · [[16 - API Documentation]] · [[05 - Main Platform Admin Panel]] ·
[[11 - Subscription Decisions]] · [[17 - Open Questions]] · [[18 - Decision Log]]
