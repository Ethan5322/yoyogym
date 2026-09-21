---
aliases: ["Database Architecture", "Database Design"]
tags: [database, architecture, existing-system]
stage: "Stage 2"
status: mixed
updated: 2026-09-21
---

# 12 — Database Architecture

## Existing — confirmed

Supabase PostgreSQL, single schema **`gym`**, **24 tables**, accessed **server-side only** with the
service-role key. RLS enabled on every table with **zero policies** → default-deny for anon and
authenticated roles. **[C]** (`db/schema.sql`, `server/lib/supabase.js`)

13 migrations in `db/migrations/`, latest `2026-07-11-international-members.sql`. Every
migration-created table also appears in `schema.sql` — the schema file is complete. **[C]**

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

**Deletion semantics are deliberate** **[C]**: member-owned rows `cascade` (POPIA right to
erasure); staff references `set null` (preserve history). Changing either breaks a compliance
design → [[03 - Protected Existing Functions]].

### The `settings` table — resolves Q-27

`settings` is a **free-form key/value store**: `{ key (unique), value (jsonb), category,
updated_by, updated_at }`, written by `PUT /api/admin/settings` with `upsert … onConflict: 'key'`.
**There is no enumerated key list and no validation of key names.** **[C]**

Keys are discoverable only by reading consumers. Confirmed keys in use:

| Key | Read by |
|---|---|
| `gym_profile` | `admin/broadcast.js`, `admin/class-bookings.js`, `admin/finance.js`, `cron/weekly-schedule.js` |
| `contract_discounts` | `public/catalog.js`, `public/register.js` |
| `compliance` | `server/lib/compliance.js` |

`public/content.js` reads the table broadly for public legal/branding text, and `src/lib/branding.js`
drives runtime white-labelling from it. **[P]** — the store works, but an undocumented free-form
key space is a maintenance hazard and a poor fit for 10,000 tenants.

### Notable storage facts

- **No object storage anywhere.** `members.photo_url` is text; face templates are `jsonb`
  (`face_descriptor`, `face_templates` 128-D; `arcface_embedding`, `arcface_templates` 512-D,
  **currently empty**). **[C]**
- `membership_number` is `unique` — **within one gym's database only**. **[C]** → Q-03
- Indexes exist on `members` for `status`, `full_name`, `phone`, `email`. **[C]**

## Required — future platform **[M]**

None of this exists. Listing the *need*, not the design:

- Gym registry (identity, status, owner, domain/routing key)
- Owner applications + submitted documents
- Subscriptions, tiers, invoices
- Platform-level audit
- Platform-level user/role store, separate from `admin_users`

## The blocking question

**Everything about how these relate to the 24 existing tables depends on Q-01**
([[06 - Tenant Architecture]]).

- **Model A** — platform tables live in a *separate* platform database; the 24 tables are untouched
  and replicated per gym. Cross-gym reporting requires aggregation across projects.
- **Model B** — platform tables sit beside the 24, which all gain `gym_id`; `membership_number`
  uniqueness becomes `(gym_id, membership_number)`; RLS becomes load-bearing for the first time.
- **Model C** — some split of the two.

Per `CLAUDE.md` §6: **do not add `gym_id`, `tenant_id`, migrations or tenant policies until Q-01
is answered.**

## Open

Q-01 · Q-03 (identity uniqueness) · Q-12 (document retention) · Q-16 (biometric retention) ·
Q-24 (object storage) · Q-27 **resolved above**.

## Related

[[00 - Project Purpose]] · [[01 - Existing Yoyo Gym Audit]] · [[06 - Tenant Architecture]] ·
[[03 - Protected Existing Functions]] · [[14 - Security and Privacy]] · [[16 - API Documentation]] ·
[[17 - Open Questions]] · [[18 - Decision Log]]
