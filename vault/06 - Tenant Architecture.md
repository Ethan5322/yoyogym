---
aliases: ["Tenant Architecture", "Tenancy"]
tags: [architecture, tenancy, blocking, future]
stage: "Stage 2"
status: undecided
updated: 2026-09-21
---

# 06 — Tenant Architecture

**The blocking decision (Q-01).** Nothing in Stages 3–10 can be designed until this is answered.
Stage 1 is deliberately still closed — this note **states the options and the evidence, and makes
no recommendation**.

## Where things stand today — confirmed

```text
One Vercel deployment + One Supabase project + One env-var set = One gym
```

**[C]** Evidence:

- `db/schema.sql` header: *"the repeatable schema used to stand up a NEW gym tenant (one Supabase
  project per gym)"*
- `server/lib/supabase.js` reads `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` from `process.env` —
  one client, one project, per deployment
- **No `gym_id` or `tenant_id` column exists** in any of the 24 tables
- Gym identity is therefore **implicit in the deployment's domain**
- Per-gym configuration also includes `JWT_SECRET`, Paystack keys, Brevo sender, `OWNER_EMAIL`,
  CallMeBot keys — so a "tenant" today is a *set of secrets*, not a row

This is a **pre-existing architectural decision** that predates the platform brief. The brief
either ratifies or overturns it.

## The three models

### Model A — separate project + deployment per gym (today's model, scaled)

| Advantages | Risks |
|---|---|
| Isolation is absolute by construction — cross-gym leakage is physically impossible | ~10,000 Supabase projects |
| Existing code changes **almost not at all** — `CLAUDE.md` §32 is trivially satisfied | ~10,000 env-var sets to manage and rotate |
| Blast radius of a bug is one gym | Every migration must run 10,000 times |
| Per-gym backup/restore is natural | Monitoring, upgrades and support across 10,000 targets |
| | Provisioning must be fully automated or it is unworkable |
| | Vercel/Supabase account limits and cost are unknown **[?]** (Q-21) |

### Model B — shared database, shared deployment, `gym_id` + RLS

| Advantages | Risks |
|---|---|
| One deployment, one migration run, central monitoring | Requires `gym_id` on **all 24 tables** |
| Gym search, cross-gym identity and aggregate stats become trivial | Every one of the ~76 handlers must be tenant-scoped |
| Provisioning is inserting a row | Requires real RLS policies — today there are **zero** |
| Cost scales smoothly | Directly touches the surface [[03 - Protected Existing Functions]] protects |
| | One authorization bug leaks across gyms |
| | `membership_number` uniqueness must become per-gym, not global (Q-03) |

### Model C — hybrid / sharded

| Advantages | Risks |
|---|---|
| Pooled platform registry + siloed gym data is possible | Two models to build, operate and reason about |
| Can shard by region, size or tier | Routing and provisioning are more complex |
| Allows staged migration from A toward B | Support burden higher than either pure model |

## Evidence that must inform the choice

1. **No object storage exists** — photos and biometric templates live in Postgres as `jsonb`
   (Audit §3). Under Model B that is one database carrying every gym's biometrics. → Q-24, Q-16
2. **Vercel plan limits** — the 6-router layout exists to stay inside the Serverless Function
   budget, and cron count is capped (only 3 of 8 jobs are scheduled). Model A multiplies
   deployments; Model B multiplies traffic through one.
3. **`JWT_SECRET` is per-deployment.** Under Model A a compromised secret affects one gym; under
   Model B it affects all of them.
4. **Paystack keys are per-gym.** Model B needs a per-gym key lookup or Paystack subaccounts →
   collides with Q-05 (does the platform take a cut?).
5. **RLS is enabled with zero policies.** Model B makes RLS load-bearing for the first time.

## What must not happen

Per `CLAUDE.md` §6: **do not add `gym_id`, `tenant_id`, migrations or tenant policies until this
is decided.** No partial hedging toward a model.

## Related

[[00 - Project Purpose]] · [[01 - Existing Yoyo Gym Audit]] · [[03 - Protected Existing Functions]] ·
[[04 - Yoyo Gyms Platform]] · [[12 - Database Architecture]] · [[14 - Security and Privacy]] ·
[[17 - Open Questions]] · [[18 - Decision Log]] · [[19 - Implementation Phases]]
