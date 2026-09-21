---
aliases: ["Storage Migration Assessment", "Railway SQLite Migration", "Migration Assessment"]
tags: [assessment, architecture, cost, storage]
stage: "Assessment — no decision taken"
status: "evidence gathered, awaiting decision"
updated: 2026-09-21
---

# 22 — Storage Migration Assessment

**What it would take to move Yoyo Gyms off Supabase to Telga's model — SQLite files on a Railway
volume — and whether it is worth it.**

> **No decision is taken here and nothing has been changed.** This exists so the choice is made on
> measured evidence rather than on my summary of it. Everything below was counted in the repository
> on 2026-09-21, or read from vendor pricing pages.

---

## 1. Why this is being asked

The platform pays **~$10 per gym per month** for Supabase, because each gym has its own project
(D-014, D-016). At the stated target that is **~$10,000/month at 1,000 gyms** and **~$1.2M/year at
10,000**. The user's requirement is that everything runs on free or near-free tooling except the
gyms' own subscription.

Telga — the sibling product, inspected read-only — solves this differently: **SQLite files on a
Railway volume**, behind a swappable driver interface.

## 2. The cost, side by side

| | Supabase (today) | Railway + SQLite |
|---|---|---|
| 100 gyms | ~$1,000/mo | **~$5/mo** |
| 1,000 gyms | ~$10,000/mo | **~$8/mo** (Pro needed above 5 GB/service) |
| 10,000 gyms | ~$100,000/mo | storage ~$30/mo; **compute is the real question, not storage** |

Railway Hobby is **$5/month including $5 of usage**; volumes are **$0.15/GB/month**; Hobby caps a
service volume at 5 GB. **Railway is cheap, not free** — the only free thing is a one-time $5 trial
credit that expires in 30 days. Cheap-and-flat still beats free-but-capped for this purpose.

## 3. What actually has to change — measured, not estimated

### 3.1 The good news, and it changes the picture

**Only the query builder is used. Nothing else.**

```
supabase.auth      → 0 uses
supabase.storage   → 0 uses
supabase.realtime  → 0 uses
supabase.functions → 0 uses
.rpc()             → 0 uses
```

This matters more than anything else in this document. The dependency on Supabase is **not** the
platform — it is one query interface. And that interface is a **small, regular vocabulary**:

| Method | Uses | | Method | Uses |
|---|---|---|---|---|
| `.from()` | 266 | | `.in()` | 18 |
| `.eq()` | 230 | | `.single()` | 13 |
| `.select()` | 190 | | `.delete()` | 10 |
| `.maybeSingle()` | 69 | | `.lte()` | 7 |
| `.order()` | 51 | | `.or()` | 5 |
| `.update()` | 41 | | `.not()` | 5 |
| `.gte()` | 38 | | `.lt()`, `.is()` | 8 |
| `.limit()` | 35 | | `.upsert()`, `.range()`, `.neq()`, `.ilike()` | 5 |
| `.insert()` | 34 | | | |

**Twenty-one methods.** That is a shim, not a rewrite.

### 3.2 Two strategies, and they differ by an order of magnitude

**Strategy A — rewrite every call-site to SQL.** 144 query sites across 84 files. Every one
individually reviewed and tested. Honest, explicit, and **slow**: this is the weeks-long option, and
every one of the 144 is a chance to introduce a subtle bug in code that currently works.

**Strategy B — write a compatibility driver.** Implement those 21 methods over `better-sqlite3`,
behind the same interface. **The ~76 handlers do not change at all**, exactly as they did not change
for the tenancy resolver. This is days, not weeks, and the risk concentrates in **one well-tested
file** rather than spreading across 84.

**Strategy B is strongly indicated**, and for the same structural reason the tenancy work was cheap:
the codebase already funnels every database access through one seam.

### 3.3 The hard part of Strategy B, stated plainly

**36 call-sites use PostgREST resource embedding:**

```js
select('*, members(full_name, membership_number), admin_users(full_name)')
```

That is a JOIN written in PostgREST's syntax, returning a **nested object**. A shim must parse the
select string, generate the join, and re-nest the rows. It is the single genuinely difficult piece
of work in this migration — perhaps 60% of the shim's total effort and nearly all of its risk.

It is **bounded and testable**: 36 known shapes, and they are simple ones — `table(col, col)`, one
level deep, no filters on the embedded table.

### 3.4 Postgres → SQLite translation

| Postgres | Count | SQLite | Difficulty |
|---|---|---|---|
| `timestamptz` | 46 | TEXT, ISO-8601 | Easy — the app already passes ISO strings |
| `gen_random_uuid()` | 24 | generate in JS | Easy |
| `jsonb` | 17 | TEXT + `json_*()` functions | Easy — see §4 |
| `numeric(10,2)` | 11 | INTEGER cents, or REAL | **Care needed** — money as REAL is a bug waiting to happen |
| `on delete cascade/set null` | 26 | Supported, needs `PRAGMA foreign_keys=ON` | Easy, but **silently ignored if the pragma is forgotten** |
| `create index` | 30 | Same syntax | Easy |
| RLS enabled, no policies | 2 | **Not needed** | **Removed entirely** — see below |
| `citext` | 0 | — | Not used |

**RLS disappears, and that is an improvement.** Today's default-deny posture protects a shared
Postgres from a browser. With **one file per gym**, isolation is the filesystem: gym A's process
cannot read gym B's file because it never opens it. That is **stronger** than RLS and satisfies
D-014 more literally than the current design does.

## 4. Biometric data — the question that needs its own answer

Face templates are `jsonb` in three tables (`members`, `trainers`, `admin_users`): `face_descriptor`,
`face_templates`, `arcface_embedding`, `arcface_templates`.

**The storage format is the easy half.** SQLite stores JSON as TEXT and queries it with `json_*()`.
Matching happens in the application, not the database — the code reads the array and computes
distances — so **nothing about face matching changes**.

**The responsibility shift is the real half, and it goes the wrong way.**

| | Supabase today | Railway volume |
|---|---|---|
| Encryption at rest | Managed, on by default | **Yours to arrange** |
| Backups | Managed, point-in-time on paid plans | **Yours to build** (Telga wrote its own `backup`/`restore`) |
| Access control to the raw data | Postgres roles | Filesystem on one host |
| Disaster recovery | Vendor's problem | **Yours** |

Under POPIA the gym is the responsible party and MuleSoo is the operator — but an operator still
has to secure what it holds. **Moving biometric templates onto a self-managed volume means taking on
encryption at rest, backup and recovery for special personal information.** Telga wrote backup and
restore tooling for exactly this reason.

**This is not a blocker. It is a cost that must be counted**, and it is not in the $5/month.
Minimum additions if this proceeds: encryption at rest for the volume or the template columns,
automated off-host backups, and a tested restore. "Tested" meaning actually restored, not merely
scripted.

## 5. The risk that is not about code

**SQLite on a Railway volume means one machine.** A volume attaches to a single service instance —
which is why Telga runs `numReplicas: 1`.

Today the gym app is on Vercel serverless: no single point of failure, scales on its own, and a
crash affects one request. After: **every gym is down when that one machine is down** — including
their door scanner and check-in.

Telga accepts this for a product explicitly in training mode with no live money. **A gym's turnstile
at 6am is a different risk**, and it should be a conscious decision rather than a side effect of a
cost saving.

Partial mitigations, none free: Railway restart policies (already in Telga's config), a health check
(likewise), frequent off-host backups, and accepting a recovery-time objective measured in minutes.

## 6. Cron jobs stop being free

Vercel runs the three scheduled jobs today (`daily` 06:00, `daily-summary` 20:00, `weekly-schedule`
Mon 07:00). **Railway has no built-in cron** — Telga runs a long-lived worker process instead.

So the three schedules become an in-process scheduler in a permanently running service. Not
difficult, but it is work that currently costs nothing and is easy to forget when estimating.

## 7. What is unaffected

Everything built today survives, because none of it depends on Postgres:

- `platform/` in full — auth, TOTP, provisioning, reconciliation, applications, views, HTTP, CSRF
- `server/lib/tenancy.js` and the **7 isolation tests** — the resolver resolves *a client*, and
  which kind of client it is was always injected
- All 95 decisions, all 22 vault notes
- The React frontend, the 38-step registration flow, PDF generation, QR, face matching
- **115 tests**, minus those that assert Supabase-specific shapes

`getSupabase()` remains the single seam. It was worth building that way for the tenancy work, and it
pays again here.

## 8. Effort — ranges, not false precision

| Piece | Estimate | Confidence |
|---|---|---|
| Compatibility driver (21 methods) | 1–2 days | Good — the vocabulary is known |
| **PostgREST embedded selects (36)** | **1–2 days** | **Moderate — the risky part** |
| Schema translation | half a day | Good |
| Railway deployment + volume + start guard | half a day | Good — Telga's config is a working reference |
| Cron worker | half a day | Good |
| Backups + restore + a tested restore | 1–2 days | Moderate |
| **Encryption at rest for biometrics** | **unknown** | **Low — depends on the approach chosen** |
| Testing, fixing what the shim gets subtly wrong | **1–2 weeks** | **Low — this is where estimates go wrong** |

The last line is the honest one. A compatibility shim is easy to get 90% right and the last 10% is
where the subtle bugs live: null handling, ordering, type coercion, empty results.

## 9. Recommendation

**Write the driver behind the existing seam, but do not migrate yet.**

1. **The cost difference is real and enormous** — $10/gym/month against ~$5/month flat. At any
   serious gym count this is decisive, and it deserves to be taken seriously rather than dismissed.
2. **The migration is far cheaper than it first appeared.** Only the query builder is used; 21
   methods; one seam. Strategy B makes this days of work plus testing, not a rewrite.
3. **But nothing is paying for Supabase yet.** There are no live gyms. The $10/month is
   hypothetical until gyms exist, and migrating a working system before it has a single user is
   optimising a cost you are not paying.
4. **The single-server risk is the genuine objection**, not the code. It deserves a decision of its
   own, not to be inherited from a hosting choice.

**Suggested sequence:** get one real gym running on what exists → confirm the cost is real →
build the driver behind the seam, tested against the same suite → switch when it is proven.
The seam means that switch is one file, whenever it happens.

## Related

[[06 - Tenant Architecture]] · [[12 - Database Architecture]] · [[14 - Security and Privacy]] ·
[[11 - Subscription Decisions]] · [[10 - Mobile App]] · [[17 - Open Questions]] ·
[[18 - Decision Log]] · [[20 - Change History]]
