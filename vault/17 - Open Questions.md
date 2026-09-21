---
aliases: ["Open Questions", "Unknowns"]
tags: [questions, unknowns]
stage: "live register"
status: active
updated: 2026-09-21
---

# 17 — Open Questions

Everything **not** yet decided. Nothing here may be invented or assumed (`CLAUDE.md` §30).
When one is answered it moves to [[18 - Decision Log]] and is struck from the open list below.

> Rewritten 2026-09-21. The previous version had accumulated answered questions still listed as
> open — the same staleness failure this vault exists to prevent. Answered items now live in §6 with
> their decision reference, never in the open sections.

---

## 0. ✅ Milestone — every user-decidable question is now ANSWERED

As of 2026-09-21, **63 decisions** are recorded. Nothing further is waiting on a product or business
choice. What remains below is **investigation and verification**, not decisions:

| Kind | Items |
|---|---|
| **Needs an external answer** | U-1 (ask Supabase), U-2, U-4, U-5, U-6 |
| **Verify at Stage 10, never from memory** | Current store rules on subscriptions and steering (Q-14/D-060); Sign in with Apple (Q-15) |
| **Design work inside a stage** | Q-37 connection pooling, Q-38 migration orchestration |
| **Deliberately deferred** | Prices (D-058 — needs U-2 first) |

## 0b. 🔧 Outstanding chore — the Graphify graph is STALE

`graphify-out/graph.json` was built at **10:58 on 2026-09-21** and describes the vault as it was
**before** that day's later work. Since then 18 notes changed and the payment removal landed.

**A refresh was attempted and did not complete** — the extraction subagent hit the account session
limit and died before writing its output. **The graph was deliberately NOT rebuilt**: with the 18
changed notes uncached and unextracted, a rebuild would have produced a graph *missing* them, which
is worse than one that is merely out of date. (The tool's own shrink-guard would also have refused
the write.)

**To finish it** (cheap — the cache means only 18 files need work, one subagent, not four):

```bash
# after the session limit resets
graphify . --update      # or re-run the Step-3 flow; the manifest still lists the same 18 files
```

Nothing depends on this: the graph is a retrieval aid, not a source of truth. But it is exactly the
staleness `npm run docs:validate` (D-064) exists to prevent, and the validator does **not** cover
`graphify-out/` — so this one needs a human to remember it.

## 0c. 🔴🔴 BLOCKING — D-095 collides with D-078 and D-012

**Q-49 — how does a gym get its own Supabase project, without a manual step at every onboarding?**

D-095 says each gym owns its Supabase account, so the platform pays nothing. That is achievable, but
**two earlier decisions assumed otherwise** and one of them is the growth plan:

| Collides with | Why |
|---|---|
| **D-078** automatic provisioning on approval | You cannot create a project inside someone else's Supabase account without a credential from them |
| **D-012** thousands of gyms in 24 months | If every gym needs a human to create an account, onboarding is manual at every single gym — the exact maths that killed the 1–2 hour runbook |

**Three ways out, none chosen:**

1. **Owner creates the project manually, pastes URL + service key into onboarding.** Free, simple,
   no new risk. **Fully manual** — contradicts D-012 at scale.
2. **Owner generates a Supabase Personal Access Token and gives it to the platform**, which then
   provisions into *their* account automatically. **Free AND automatic.** But a PAT can create and
   delete everything in that account: the platform would hold a credential capable of destroying a
   customer's infrastructure. It must live in the secrets manager and should be **revoked
   immediately after provisioning**.
3. **Platform pays** (the design as built). Automatic, scales, ~$10/gym/month.

⚠️ **Also inherited from D-095, and product-affecting: Supabase free projects PAUSE after 7 days of
inactivity.** An active gym checks members in daily and stays awake, but a new gym in its first
quiet week, or a seasonal one, would find its system simply stopped. **This needs a decision of its
own**, because a paused database is indistinguishable from an outage to the gym.

### What it does to the code already built

**Less than it sounds, because provisioning takes its steps as injected dependencies.** Only step 1
(`createSupabaseProject`) changes — from "create in our org" to "receive credentials" or "create in
theirs". Steps 2–8 (schema, seed, store secret, register gym, connection, migration baseline) are
unaffected, and `reconciliation.js` becomes less relevant since the projects are no longer in one
organisation to list.

## 1. 🔴 Highest priority — the risk carrying the whole architecture

**U-1 — maximum Supabase projects per organisation.** Undocumented by Supabase.
**D-016 (tenancy) and D-014 (a database per gym) both rest on there being no ceiling below the
target of thousands of gyms.** The user approved D-016 outright and **accepted this risk**.

**Action: ask Supabase directly.** This is a support ticket, not something to infer. If a ceiling
exists, D-016 and D-014 both reopen.

## 1b. ✅ Resolved — the expensive failure mode (D-085)

**Q-48 — what happens to an orphaned Supabase project?** If provisioning creates the project and a
later step fails, there is a **real project being billed monthly that the platform database knows
nothing about**. The orchestrator reports it (`orphanedProjectRef`) and audits
`gym.provision.failed`, but **deliberately does not delete it**: auto-deleting a database because a
later step failed is how a transient error destroys a gym's data.

**Answered: option 1, a reconciliation job** (D-085, built). It compares the real Supabase estate
against the registry in both directions, reports orphans and dangling rows with an estimated monthly
waste figure, audits the findings, and **is never given a delete function** so it cannot destroy a
gym's database. Removal stays a human decision, and `deleteProject()` itself refuses unless the
caller states the action is permanent.

**Still to schedule:** nothing runs this yet. It needs a cron entry or a button in the platform
panel — carried into Stage 5.

## 2. ⚠️ Conflicting answers — needs the user to resolve

**Q-46 — where does face matching happen?** Two answers on 2026-09-21 point opposite ways:

- *"Rebuild face matching natively on-device"*
- *"Deploy ArcFace — the app needs **server-side** matching"* (D-039)

They are not the same design, and the difference is not only engineering effort — **it decides
whether members' face templates leave the server**.

**Proposed reconciliation (NOT adopted — needs approval).** Split by what is being matched:

| Use | Match | Why |
|---|---|---|
| **Member face sign-in** (1:1 — is this *their* face?) | **On-device**, or better, the phone's own biometric unlock guarding a stored credential | Only ever touches that one member's own face. Matches `CLAUDE.md` §20: *"use device biometrics to unlock a secure credential instead of uploading raw face data."* |
| **Door / turnstile scanner** (1:N — who is this, out of every member?) | **Server-side ArcFace** | 1:N matching on-device would require **shipping the gym's entire member face gallery to a phone**. That is a serious POPIA exposure of special personal information and should not be done |

The deciding fact: **on-device 1:N matching means biometric templates for every member sitting on a
device.** That is the part to say yes or no to.

## 4. Stage 4 — platform boundary and gym resolution

- **Q-36** Per-gym secrets store. **Load-bearing** under D-016: per-gym Supabase URLs, service keys
  and `JWT_SECRET`s cannot live in Vercel env vars (64 KB total per deployment). Where do they live,
  how are they fetched per request, how are they rotated?
- ~~**Q-37** Connection pooling~~ — **reframed and largely dissolved (D-074).** `supabase-js` speaks
  HTTPS to PostgREST with no TCP driver, so there is no pool to exhaust. What replaces it:
  **Q-47 — Infisical's rate limits for per-request secret fetches**, which are now on the hot path
  and are unverified.
- **Q-30** Where does the platform admin panel live — same deployment, separate deployment, or a
  separate repository? (Related to Q-22.)
- **Q-31** Does the platform owner ever need to *enter* a gym's admin panel (impersonation or
  support access)? In direct tension with "Gym 1 must not see Gym 2 data"; needs its own design.

## 5. Stage 6 — owner onboarding and provisioning

- **Q-09** Which documents must a gym owner submit, and who reviews them?
- **Q-10** Approval rules, review SLA, rejection and appeal process.
- **Q-11** Is the owner identity created before or after subscription activation?
- **Q-12** Document retention period and storage location.
- **Q-24** Object storage strategy — for application documents, member photos and biometric
  templates. **Nothing exists today**, which blocks `application_documents.storage_ref` being usable.
- **Q-38** Migration orchestration across N databases: per-gym schema-version tracking,
  partial-failure handling, checksum drift detection, and a central view of who is on which version.
- **Q-21** Who runs provisioning at this scale, and at what cost? D-012 settled that it **must** be
  automated; the cost is still open.
- **Q-22** Does platform code live in this repository, a sibling repository, or a monorepo?

## 6. Later stages

**Commercial (Stage 7)** — **Q-04** tiers, prices, currency, billing cadence (provisional only:
Basic ~40 / Medium ~150 / Prime ~500 active members) · **Q-06** trial period, and whether a payment
method is required during it.

**Mobile and stores (Stages 8–10)** — **Q-08** are subscriptions bought in-app or on the web? · **Q-14**
store rules on digital subscriptions may prohibit an external payment page — **verify from official
docs at Stage 10, never from memory** · **Q-15** does adding Google Sign-In to iOS trigger Apple's
Sign in with Apple requirement?

**Security, privacy, legal** — **Q-16** biometric retention policy (face templates already exist as
`jsonb` in `members`; any policy must cover data already held, and Q-46 may put them on devices) ·
**Q-18** jurisdictions beyond South Africa · **Q-20** RLS policies must exist before any Supabase
client reaches a mobile app.

> **Q-19 is no longer here — it was UPGRADED to a blocking pre-launch item (D-034).** Under
> app-based routing any client can aim `/api/document` at any gym, multiplying the guessing
> surface by the number of gyms. Must be session-bound and/or per-gym rate-limited before launch.

**Unresolved and explicitly not a dependency** — **Q-41** "Telga". Appears nowhere in this
repository; whether it is a billing entity, a brand name or a typo is unknown. Per D-024 it is
**not** part of the architecture and nothing references it.

## 7. Unknown costs and limits

| # | Unknown | Status |
|---|---|---|
| U-1 | Max Supabase projects per organisation | **OPEN — highest priority** (§1) |
| U-2 | Real per-project monthly floor at Basic/Medium/Prime gym sizes | open |
| U-3 | Vercel Enterprise ceiling for projects-per-Git-repository | **moot under D-016** — one deployment, not thousands |
| U-4 | Supabase/Vercel partner or reseller terms at volume | open |
| U-5 | Cost and reliability of automated provisioning via both management APIs | open |
| U-6 | Real ongoing support hours per gym per month | open |
| U-7 | Will gyms accept MuleSoo-owned infrastructure? | **resolved by D-014** — each gym keeps its own database |
| U-8 | Migration cost for existing live gyms | **resolved by D-019** — none are live |

## 8. ✅ Answered — see [[18 - Decision Log]] for the reasoning

| # | Question | Answer |
|---|---|---|
| **Q-01** | Tenancy model | **Model C** — shared app, per-gym database, resolution at `getSupabase()` (D-016) |
| Q-05 | Revenue model | Flat subscription from gyms only; no share of member payments (D-013) |
| Q-07 | Gym non-payment | 2-day warning → suspend → **data retained** (D-026, D-027) |
| Q-23 | Commit the vault to git? | Yes; app state and secrets excluded (D-009) |
| Q-02 | How does a request reach the right gym? | **In-app** — scan the gym QR or search the gym name against the registry. **No subdomains** (D-036) |
| Q-03 | Member identity across gyms | **Separate identity per gym** (D-041). Existing login unchanged |
| Q-13 | Mobile framework | **One cross-platform codebase**, real store apps (D-038) |
| Q-17 | ArcFace service | **Deploy it** (D-039) — ⚠️ see Q-46 |
| Q-45 | Refund bug | **Refunds removed entirely** (D-037) |
| Q-25 | Is `IdPhotoStep.jsx` dead code? | No — live, rendered for control type `face` |
| Q-26 | What activates a member? | `activatePayment()`, then and now (D-017) |
| Q-27 | Are `settings` keys documented? | No — free-form store; `gym_profile`, `contract_discounts`, `compliance`, now `billing_rules` |
| Q-28 | Are the `qr/` assets current? | Yes — generated by `scripts/generate-qr.js`, hardcoded domain |
| Q-29 | Staff on the door scanner? | No — member and trainer only |
| Q-32 | Is the scale target real? | Thousands within 24 months — real (D-012) |
| Q-33 | Keep the gym-owned posture? | Platform never touches member money; gym keeps its own database (D-013, D-014) |
| Q-34 | What activates a member without Paystack? | Manual cash/EFT capture (D-017) — **implemented** |
| Q-35 / Q-39 | Scope of the payment removal | Online path out, tracking stays (D-018, confirmed) |
| Q-40 | Platform billing provider | Paystack (D-020) |
| Q-42 | Automatic member suspension | Per-gym setting, **off by default** (D-028) |
| Q-43 | Which Paystack account for the platform? | Reuse the existing account and keys (D-025) |
| Q-44 | Show the member their balance? | Yes — amount shown, no online payment (D-029) |

## Related

[[00 - Project Purpose]] · [[01 - Existing Yoyo Gym Audit]] · [[06 - Tenant Architecture]] ·
[[12 - Database Architecture]] · [[18 - Decision Log]] · [[19 - Implementation Phases]] ·
[[20 - Change History]] · [[21 - Member Payment Removal Design]]
