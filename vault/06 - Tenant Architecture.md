---
aliases: ["Tenant Architecture", "Tenancy", "Tenancy Comparison"]
tags: [architecture, tenancy, decided, stage-1]
stage: "Stage 1 — CLOSED"
status: decided
decision: "Model C — shared application, per-gym database"
updated: 2026-09-21
---

# 06 — Tenant Architecture

> ## ✅ DECIDED 2026-09-21 — D-016
>
> **Model C: one shared application deployment + one Supabase project per gym + gym resolution
> injected at `getSupabase()` + a per-gym secrets store + an orchestrated migration runner.**
>
> Each gym's data stays physically separate (D-014). The application is deployed once.
>
> **Accepted risk:** approved outright rather than pending **U-1** — the maximum number of Supabase
> projects per organisation is still undocumented. **If a ceiling exists below the target, this
> decision and D-014 must both be revisited.** Confirm with Supabase directly.
>
> The comparison below is retained as the reasoning behind the decision. Do not read §7 as open.

**Q-01 is closed.** The comparison that produced it follows.

Markers: **[C]** confirmed in repository · **[V]** verified from official vendor docs 2026-09-21 ·
**[?]** unknown — must not be invented.

---

## 1. Evidence used

| Source | What it gave |
|---|---|
| `db/schema.sql` header **[C]** | *"the repeatable schema used to stand up a NEW gym tenant (one Supabase project per gym)"* |
| `server/lib/supabase.js` **[C]** | One client per deployment, bound to `process.env` |
| All 24 tables **[C]** | **No `gym_id` / `tenant_id` column anywhere** |
| `.env.example` **[C]** | A tenant today is a *set of secrets*, not a row |
| `DELIVERY.md:3` **[C]** | *"Single-tenant: one Supabase project + one Vercel deployment **per gym**."* |
| `scripts/business-guide.js:157-196` **[C]** | The documented commercial model — see §2, this is decisive |
| `vercel.json` + `api/` layout **[C]** | 6-router design; 3 of 8 crons scheduled |
| [Vercel Limits](https://vercel.com/docs/limits) **[V]** | Project, repo-link, deployment and cron limits |
| [Supabase billing](https://supabase.com/docs/guides/platform/billing-on-supabase) **[V]** | Per-project dedicated compute, org-based billing |
| Graphify graph (1,550 nodes) | Surfaced the commercial-model ↔ tenancy link that prose review had missed |

## 2. The decisive evidence — the existing commercial model

Found via Graphify, then **verified in source** at `scripts/business-guide.js:157-162`. The business
model already makes a deliberate legal and financial decision **[C]**:

> **"For each gym, set these up under the GYM'S OWN accounts, not yours:"**
> - **Paystack** — the gym's own account. *"Member payments must flow to them. You only paste their
>   API keys into their instance, so you never handle their members' money or carry financial
>   liability."*
> - **Supabase** — *"ideally the gym's own project for clean data isolation and POPIA."*
> - **POPIA** — *"the gym is the 'responsible party' for member data; you are the
>   operator/processor."*

And the maintenance model, `business-guide.js:191`:

> *"Fix a bug once → push to GitHub main → every gym's Vercel redeploys automatically… build once,
> deploy many, maintain centrally."*

**This is not an accident of implementation. It is a deliberate liability posture**, and it is the
single most important input to Q-01. Pooling every gym's members into one database owned by the
platform would reverse it: MuleSoo would become the responsible party for ~10,000 gyms' member
health and biometric data, and — if payments were also pooled — would handle members' money.

> ⚠️ This is a **business/legal** decision recorded in a sales document, not a technical constraint.
> The user can change it. But it must be changed **deliberately and explicitly**, not silently as a
> side-effect of picking a database topology.

## 3. Verified platform limits

### Vercel **[V]** ([docs](https://vercel.com/docs/limits), updated 2026-09-16)

| Limit | Hobby | Pro | Enterprise |
|---|---|---|---|
| Projects | 200 | **Unlimited** | Unlimited |
| **Projects connected per Git repository** | 25 | **150** | **Custom** |
| Deployments/day | 100 | 6,000 | Custom |
| Deployments/hour | 100 | 450 | 1,800 |
| Functions per deployment | Framework-dependent | ∞ | ∞ |
| **Cron jobs per project** | **100** | **100** | **100** |
| Env vars per project per env | 1,000 | 1,000 | 1,000 |
| Env var total size | 64 KB | 64 KB | 64 KB |

Two findings:

1. **The 150-projects-per-Git-repository limit is a hard blocker for naive Model A.** The documented
   model is *"One repo, many Vercel projects"* (`business-guide.js:173`). At 10,000 gyms that is
   **66× over the Pro limit**. Enterprise is "Custom" — negotiable, but the ceiling is **[?]**.
2. **The cron constraint in the codebase is now obsolete.** Cron jobs are **100 per project on every
   plan**; Vercel removed per-team limits in January 2026. The code comment *"Hobby-plan friendly"*
   in `server/handlers/cron/billing.js` and the choice to schedule only 3 of 8 jobs reflect the
   **old** limit (2 per team on Hobby). **This is a factual update to the audit, not a defect** —
   the consolidated orchestrator still works. No code change is proposed here (§32 protected).

### Supabase **[V]** ([docs](https://supabase.com/docs/guides/platform/billing-on-supabase))

- Billing is **per organization**; each org has its own plan, payment method and invoices.
- **"Each project includes a dedicated Postgres instance running on its own server. You are charged
  for the Compute resources of that server, independent of your database usage."**
- **"Each project you launch increases your monthly Compute costs."**
- Free plan: 2 projects, counted across all orgs where you are Owner/Admin.
- **Maximum projects per organization on paid plans: not documented [?]** — must be confirmed with
  Supabase before Model A is costed.
- Minimum per-project Pro cost: **not disclosed on the billing page [?]**.

**The consequence for Model A is unavoidable: cost scales linearly with gym count, with a floor per
gym regardless of how small that gym is.** A 40-member Basic-tier gym pays the same compute floor as
a 500-member Prime gym. That interacts directly with [[11 - Subscription Decisions]].

---

## 4. Comparison across the 16 requested dimensions

| Dimension | **Model A** — project + deployment per gym | **Model B** — shared DB + `gym_id` + RLS | **Model C** — hybrid / sharded |
|---|---|---|---|
| **Security isolation** | **Strongest.** Physically separate databases; cross-gym leakage impossible by construction | Weakest. One authorization bug leaks across all gyms; correctness rests on RLS + every handler | Between the two; isolation depends on where the boundary is drawn |
| **Operational cost** | Linear, with a **per-project compute floor** **[V]**; small gyms are disproportionately expensive | Sub-linear; one cluster serves many gyms; best cost curve | Mixed; pooled registry cheap, siloed data still per-gym |
| **Provisioning complexity** | **Severe.** Documented runbook is **~1–2 hrs manual per gym** (`business-guide.js:166`) across 8 steps. ×10,000 = 10,000–20,000 hours unless fully automated via the Supabase + Vercel management APIs | **Trivial** — insert a row | Moderate; two provisioning paths to build and maintain |
| **Vercel limits** | **Blocked at 150 projects per Git repo (Pro)** **[V]**. Needs Enterprise "Custom", ceiling **[?]**. Also 6,000 deploys/day caps a mass redeploy | One project. No limits reached | Depends on shard count; 150/repo caps shards if each is a project |
| **Supabase limits** | Per-project dedicated compute **[V]**; max projects/org **[?]** | One project; usage quotas apply org-wide | Per-shard compute |
| **Migration complexity** | Every migration runs **N times**; partial failure leaves gyms on mixed schema versions with no central view | One migration, one run, one schema version | Once per shard + once for the registry |
| **Existing code impact** | **Near zero.** `getSupabase()` already reads env; the 24 tables and ~76 handlers are untouched. [[03 - Protected Existing Functions]] trivially satisfied | **Severe.** `gym_id` on all 24 tables; tenant scoping in every handler; `membership_number` unique constraint becomes `(gym_id, membership_number)`; RLS policies written from zero. Directly touches the protected surface | Moderate; existing gym code can stay single-tenant if only the platform layer is pooled |
| **Paystack key management** | **Matches the documented model exactly** — the gym's own account, keys in their own instance, MuleSoo never touches member money **[C]** | Requires per-gym key lookup at runtime, or Paystack subaccounts/split payments. **Reverses the stated liability position** unless carefully designed | Can preserve per-gym keys while pooling platform billing |
| **JWT secret management** | Per-deployment secret; **compromise affects one gym**; rotation is per-gym | One secret across all gyms; **compromise is platform-wide**. Note admin/member separation rests solely on the JWT `audience` claim with a **shared** secret **[C]** | Per-shard secrets |
| **Object storage** | No storage today; photos/biometrics sit as `jsonb` **inside each gym's own Postgres** **[C]** — which is consistent with gym-owned data | Every gym's biometric templates in **one** database → concentrated sensitive-data risk, and a much heavier POPIA position | Storage can stay gym-side while metadata pools |
| **RLS requirements** | **None new.** Default-deny with zero policies remains safe because the browser never touches Supabase **[C]** | **RLS becomes load-bearing for the first time.** Every table needs correct, tested policies before any client-side access | Only pooled tables need policies |
| **Backup and recovery** | Natural per-gym backup/restore; one gym can be restored without touching others. `RECOVERY.md` exists **[C]** | Restore is all-or-nothing; per-gym point-in-time recovery needs custom tooling | Per-shard restore |
| **Monitoring** | **10,000 targets.** No aggregate view without building one | One target; central dashboards | Shard count targets |
| **Updates** | *"Build once, deploy many"* **[C]** — but a mass redeploy of 10,000 projects must respect 6,000 deploys/day and 450/hour **[V]**, i.e. **≥2 days to roll out one fix** | One deploy updates everyone instantly — and breaks everyone instantly | Staged rollout possible, which is a genuine advantage |
| **Support burden** | Per-gym triage; the gym owns its own Supabase/Paystack accounts, so support requires their access | Central triage; full visibility — which is *also* the privacy problem | Mixed |
| **Feasibility at ~10,000** | **Not feasible as currently practised.** Manual runbook, the 150/repo limit, per-project compute floor, and 2-day rollout all fail at that scale. Feasible only with full API automation, an Enterprise agreement, and accepted cost | **Technically feasible.** The blocker is legal/commercial, not technical | **Feasible**, at the price of building and operating two models |

---

## 5. Impact on the existing single-gym system

| | Model A | Model B | Model C |
|---|---|---|---|
| 24 tables | untouched | all altered | untouched or partly |
| ~76 handlers | untouched | all tenant-scoped | platform-layer only |
| Auth (`auth.js`, `memberauth.js`) | untouched | gym scoping added | likely untouched |
| `membership_number` uniqueness | unchanged, gym-scoped | becomes composite | unchanged |
| RLS posture | unchanged | rewritten | partly |
| §32 protected surface | **not violated** | **violated — requires an approved decision** | probably not violated |

Model B cannot be implemented without an explicit approved exception to
[[03 - Protected Existing Functions]]. That is not an argument against it — it is a procedural
requirement that must be met first.

## 6. Unknown costs and limits — must not be guessed

| # | Unknown |
|---|---|
| U-1 | Maximum Supabase projects per organization on paid plans **[?]** |
| U-2 | Actual per-project monthly floor (compute + plan) at the gym sizes in [[11 - Subscription Decisions]] **[?]** |
| U-3 | Vercel Enterprise ceiling for projects-per-Git-repository ("Custom") **[?]** |
| U-4 | Whether Supabase/Vercel offer partner or reseller terms at this volume **[?]** |
| U-5 | Cost and reliability of automated provisioning via both management APIs **[?]** |
| U-6 | Real support hours per gym per month — the runbook covers setup, not ongoing support **[?]** |
| U-7 | Whether gyms will accept MuleSoo-owned infrastructure (Model B) given the current pitch **[?]** |
| U-8 | Migration cost of moving *existing* live gyms into whichever model is chosen **[?]** |

## 6b. Narrowed by the user's answers — 2026-09-21

Four answers changed the shape of this decision (D-012 … D-015):

| Answer | Effect on Q-01 |
|---|---|
| **Thousands of gyms within 24 months — a real plan** | Manual provisioning is dead. Automation via both management APIs is mandatory in every model |
| **Each gym must have its own database** | **Model B is ruled out.** Pooling special personal information is off the table |
| **Flat subscription from gyms only; platform never touches member money** | The Paystack-key-management dimension largely disappears from the platform design |
| **Member payments removed from the product entirely** | See [[03 - Protected Existing Functions]] — protected-surface change, blocked on Q-34 |

### The distinction that opens the door

"Each gym must have its own **database**" does **not** mean "each gym must have its own
**deployment**." Separating those two questions is what makes thousands of gyms tractable:

| | Own database | Own deployment |
|---|---|---|
| **Model A as documented** | ✅ yes | ✅ yes — and this is what breaks |
| **Model C (shared app, per-gym DB)** | ✅ yes | ❌ no — one app serves all gyms |

Every blocker found in §3 is a **deployment**-side blocker, not a database-side one:

- 150 Vercel projects per Git repo **[V]** → gone with one deployment
- ≥2 days to roll out one fix (6,000 deploys/day) **[V]** → gone; one deploy
- 10,000 env-var sets, each capped at 64 KB **[V]** → gone; credentials move to a secrets store
- 10,000 monitoring targets → one application to monitor (databases still N)

What stays hard under Model C: **N migrations still have to run against N databases** — that is
inherent to physical isolation and needs an orchestrated migration runner with per-gym version
tracking. Per-project Supabase compute cost also stays linear **[V]**.

### The seam already exists — evidence from the graph

The Graphify god-node analysis found `getSupabase()` with **159 edges** — the third most connected
symbol in the codebase. Every one of the ~76 handlers reaches the database through that **single
function** (`server/lib/supabase.js`), which today returns a module-level singleton bound to
`process.env`.

**That means gym resolution can be injected at exactly one point.** Changing `getSupabase()` from
"singleton from env" to "resolve this request's gym → return that gym's client" leaves all 24 tables
and all ~76 handlers untouched. It is a real change to a protected file and needs its own approved
decision — but it is one function, not a codebase rewrite.

This is the single most useful thing the knowledge graph surfaced about implementation.

### Recommendation for Q-01 — offered for approval, not adopted

**Model C, in the specific shape of: one shared application deployment + one Supabase project per
gym + a gym-resolution layer injected at `getSupabase()` + a secrets store for per-gym credentials
+ an orchestrated migration runner.**

It is the only option that satisfies every constraint the user has now fixed: physical data
isolation (D-014), thousands of gyms (D-012), no Vercel repo/deploy ceilings, instant rollout, and
a near-untouched protected surface.

**What must still be validated before this becomes a decision:**

1. **U-1 — maximum Supabase projects per organisation.** Undocumented. If a hard ceiling exists
   below the target, *every* own-database model fails and D-014 has to be revisited.
2. **U-2 — per-project compute floor × thousands.** The dominant cost, and it sets the floor price
   of the Basic tier.
3. Connection management: thousands of Supabase clients from one serverless app needs a pooling and
   eviction strategy.
4. Where per-gym secrets live, and how `JWT_SECRET` is kept per-gym.

**I am not choosing this.** Q-01 is the user's decision and must be recorded in
[[18 - Decision Log]].

## 6c. Tenant resolution chain (Stage 3 design — PROPOSED)

How a request becomes a gym-scoped database client. The data model behind it is in
[[12 - Database Architecture]] §4.4.

> **Revised 2026-09-21 (D-036).** There are **no per-gym subdomains**. Each gym has a **name** and
> its **own QR code**, and members find their gym **inside the Yoyo app** — by scanning that QR or
> by searching the name against the platform registry. Gym identity therefore arrives as an
> ordinary request parameter, not as a hostname. See "The rule, restated" below.

```text
Platform user
   │  identity from a platform JWT (audience: "platform")  ─── or ───
   │  member/staff identity from a gym JWT (audience: "member" / admin)
   ▼
Gym identifier
   │  from the app: a scanned gym QR, or a gym chosen from search results
   │  (public information — resolved, then verified; see below)
   ▼
gyms row            lookup by slug · must be status 'active'
   │                suspended → 402/403 · unknown → 404
   ▼
gym_connections     status must be 'healthy' · gives supabase_url, project ref, schema
   │                unreachable → 503
   ▼
gym_secrets         secret_ref pointers → fetch VALUES from the external store
   │                fetch failure → 503 · NEVER fall back to another gym's credentials
   ▼
Supabase client     pooled per gym, LRU-evicted, keyed on gym_id
   │
   ▼
getSupabase()       the existing single function — returns THIS request's client
   │
   ▼
Existing Yoyo Gym system   all 24 tables, all ~76 handlers, UNCHANGED
```

### The rule, restated for app-based routing

The original form of this rule said gym identity must come from the host or a signed claim. With
D-036 there is no host to read, so the rule is restated — **weakened in form, not in effect**:

> **A client may NAME a gym. It may never be GRANTED anything on the strength of that name alone.**
>
> 1. The gym identifier is **public** — anyone can search gyms in the app. It is not a secret and
>    does not need to be.
> 2. The server resolves the name to a `gyms` row and that gym's own connection.
> 3. **Authentication is then verified against that gym's own credentials.** Each gym has its own
>    `JWT_SECRET`, so a token minted for gym A simply fails verification against gym B.
> 4. No endpoint returns gym-scoped data on the client's claim alone.

The isolation guarantee is unchanged: it never rested on hiding which gym you were asking for, it
rests on credentials only working against their own gym's database.

### ⚠️ What this genuinely costs — two consequences to design for

1. **Every unauthenticated, gym-scoped endpoint becomes reachable for every gym.**
   `/api/catalog`, `/api/content` and `/api/register` are public by design, so this is acceptable —
   but **rate limiting must become per gym**, not global, or one gym's traffic starves another's.
2. **`/api/document` gets materially riskier (Q-19).** It authorises on membership number +
   verification code with no session. Under one gym that is a two-secret bearer token. Once any
   client can aim it at **any** gym, the guessing surface multiplies by the number of gyms.
   **This must be fixed before launch** — session-bound, rate-limited per gym, or both. Q-19 is
   upgraded from "re-review" to a blocking pre-launch item.

### Token scoping

Each gym keeps **its own `JWT_SECRET`** (`gym_secrets`). A token minted for gym A therefore fails
verification against gym B's secret, so the existing `audience` separation (member vs admin) gains
a second, per-gym dimension for free. Tokens should also carry the gym id so a mismatch is caught
explicitly rather than only by signature failure.

### Failure modes — all must fail closed

| Condition | Response |
|---|---|
| Unknown slug | 404, no detail leaked |
| Gym `suspended` / `terminated` | 403 (or 402 for billing), never data |
| Connection `unreachable` / `degraded` | 503 |
| Secret fetch fails | 503 — **never** a fallback client |
| Resolver cannot determine a gym | **Refuse the request.** Never a default gym |

The last row matters most: a "default gym" fallback anywhere in this chain is a cross-tenant data
leak waiting to happen.

## 7. What the evidence supports — and what it does not

**No model is chosen.** What the evidence does support, stated plainly:

1. **Pure Model A does not reach ~10,000 gyms as currently practised.** Three independent verified
   blockers: the 150-projects-per-repo Pro limit **[V]**, the per-project compute floor **[V]**, and
   a ~1–2 hour manual runbook per gym **[C]**. It could reach that scale only with full provisioning
   automation, an Enterprise agreement, and accepted linear cost.
2. **Pure Model B is technically the best fit for 10,000 gyms and directly contradicts the
   documented commercial posture** — gym-owned Paystack, gym-owned data, gym as POPIA responsible
   party, MuleSoo as processor **[C]**. That contradiction is resolvable only by the user, as a
   business decision.
3. Therefore the realistic space is **Model C, or Model B with an explicit change to the commercial
   model, or Model A with a lower gym target.**

**One genuine recommendation, offered because the evidence is strong:** *pressure-test the ~10,000
figure before choosing a topology.* Nothing in the repository or business material describes a path
to 10,000 gyms — the documented model is a hands-on agency practice selling to independent
owner-run gyms with a 1–2 hour manual onboarding. The right architecture for **100** gyms
(Model A, automated) is genuinely different from the right architecture for **10,000** (Model B or
C). Choosing for 10,000 when the realistic 24-month number is 100 would impose the full cost of
Model B on the protected single-gym system for a scale that may never arrive.

That is a recommendation about **which question to answer first**, not a recommendation of a model.

## 8. Still requires user approval

| # | Decision |
|---|---|
| Q-01 | **The tenancy model.** Nothing below can be designed first |
| Q-05 | Revenue model — flat gym subscription vs a share of member payments. Directly determines whether the Paystack posture survives |
| — | Whether the ~10,000 target is a real 24-month plan or an aspiration (see §7) |
| — | Whether the gym-owned data / POPIA-processor posture is retained or deliberately changed |
| Q-02, Q-03 | Platform boundary and member identity — answerable only after Q-01 |
| — | If Model B: an explicit approved exception to [[03 - Protected Existing Functions]] |

## Related

[[00 - Project Purpose]] · [[01 - Existing Yoyo Gym Audit]] · [[03 - Protected Existing Functions]] ·
[[04 - Yoyo Gyms Platform]] · [[11 - Subscription Decisions]] · [[12 - Database Architecture]] ·
[[14 - Security and Privacy]] · [[17 - Open Questions]] · [[18 - Decision Log]] ·
[[19 - Implementation Phases]] · [[20 - Change History]]
