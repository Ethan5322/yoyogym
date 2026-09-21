---
aliases: ["Decision Log", "Decisions"]
tags: [decisions, log]
stage: "Stage 2"
status: active
updated: 2026-09-21
---

# 18 — Decision Log

Append-only. One row per decision, newest first. A decision enters this log **only after the user
has approved it**. Proposals live in [[17 - Open Questions]] until then.

Per `CLAUDE.md` §29, an approved decision recorded here outranks repository behaviour for *future*
work — but never rewrites what the code actually does today ([[01 - Existing Yoyo Gym Audit]]).

| # | Date | Decision | Rationale | Affects |
|---|---|---|---|---|
| D-021 | 2026-09-21 | **`server/lib/paystack.js` must NOT be deleted during the payment removal.** D-018 removes the *member-facing* Paystack flow; D-020 then needs the same Paystack primitives **platform-side** for gym subscriptions. Keep the library, delete the member payment path | Deleting and rewriting the same integration weeks later wastes work and loses the webhook-hardening (HMAC + independent re-verify) already proven in `payments/webhook.js` | [[03 - Protected Existing Functions]] |
| D-020 | 2026-09-21 | **Platform billing provider: Paystack**, for **gym→platform subscriptions only**. No member ever appears in `platform_invoices`. Platform Paystack credentials are a platform-level secret, never stored in `gym_secrets` | User instruction 2026-09-21. Answers Q-40 | [[11 - Subscription Decisions]], [[12 - Database Architecture]] §4.5 |
| D-019 | 2026-09-21 | **No gym is live in production yet.** The payment removal can therefore be a **clean deletion** — no feature flag, no staged cutover, no in-flight-transaction migration, no risk to real money | User confirmation 2026-09-21 | Removes the largest risk from D-015 |
| D-018 | 2026-09-21 | **Payment removal scope: remove the online card path, KEEP payment tracking.** Out: Paystack, `PaymentScreen`, `PaymentCallback`, member self-pay, `cron/billing.js`, `cron/retry-suspend.js`. **Stays**: `payments` table, manual cash/EFT capture, AR aging, dunning, receipts, and the per-gym `plans` / `addon_services` catalog. ⚠️ **Inferred** from the user's words *"allow each gym to make its own plan, I am not responsible for each gym plans and things related"* combined with D-017, which requires manual capture to exist. **Confirm before implementing** | Each gym defines its own plans, prices and payment arrangements; the platform neither dictates them nor carries responsibility for them. Gyms still need to know who has paid | [[03 - Protected Existing Functions]] |
| D-017 | 2026-09-21 | **Q-34 answered: recording a manual cash/EFT payment activates the member.** Staff capture a payment → member and membership become `active`, mirroring `activatePayment()` without Paystack | Keeps "paid = active" as the rule, so the membership lifecycle, arrears and reporting continue to mean something | `admin/payments.js`, `lib/activation.js` |
| D-016 | 2026-09-21 | **Q-01 DECIDED — Model C: one shared application deployment + one Supabase project per gym + gym resolution injected at `getSupabase()` + a per-gym secrets store + an orchestrated migration runner.** ⚠️ **Accepted risk:** the user approved outright rather than pending **U-1** (maximum Supabase projects per organisation, still undocumented). If a ceiling exists below the target, this decision and D-014 must both be revisited | The only shape satisfying every fixed constraint: physical data isolation (D-014), thousands of gyms (D-012), no Vercel repo or deploy ceiling, instant rollout, and a near-untouched protected surface. The graph showed all ~76 handlers reach the database through `getSupabase()` alone, so gym resolution has exactly one insertion point | **Unblocks Stages 3–10** |
| D-015 | 2026-09-21 | **Member payments to be REMOVED from the product.** Members will not pay through this system at all; each gym collects member fees by its own means, outside the software. ⚠️ **Approved in principle — implementation NOT started.** This changes the protected surface (`CLAUDE.md` §32), so the full impact analysis in [[03 - Protected Existing Functions]] §"Pending approved change" must be read and the **activation gap (Q-34) resolved** before any code moves | User decision 2026-09-21. The platform bills gyms only; member↔gym money is out of scope | `payments/*`, `paystack.js`, `activation.js`, PaymentScreen, PaymentCallback, `member/pay.js`, `cron/billing.js`, `cron/retry-suspend.js` |
| D-014 | 2026-09-21 | **Each gym must have its own database.** Physical data isolation is non-negotiable. **Rules out Model B** | Member data includes health (PAR-Q, injuries, medical aid) and biometric face templates — special personal information under POPIA. User will not pool it | [[06 - Tenant Architecture]] |
| D-013 | 2026-09-21 | **Revenue model: flat subscription from gyms only.** The platform never handles, routes or sees member money, and takes no share of it | Keeps MuleSoo out of the money flow and out of financial liability; simplest billing | [[11 - Subscription Decisions]] |
| D-012 | 2026-09-21 | **Scale target confirmed: thousands of gyms within 24 months — a real plan, not an aspiration.** Consequence accepted: the documented 1–2 hour manual onboarding runbook cannot survive; provisioning **must** become automated via the Supabase and Vercel management APIs | User decision 2026-09-21, after being shown the manual-runbook maths | [[06 - Tenant Architecture]], [[07 - Owner Workflows]] |
| D-011 | 2026-09-21 | **Graphify runs without `--obsidian`.** The graph is a retrieval layer in `graphify-out/`; it never writes into `vault/` | The 21 curated notes must not be overwritten by one-file-per-node output | Vault integrity |
| D-010 | 2026-09-21 | **`graphify-out/` is git-ignored** | Derived data, regenerable from `vault/` + source with one command; `graph.json` alone is 2.3 MB | Repository size |
| D-009 | 2026-09-21 | **Q-23 answered: project documentation IS committed to Git.** `vault/`, `CLAUDE.md`, `.gitignore` committed on `docs/yoyo-gyms-second-brain`. **Excluded**: `.obsidian/` (vendored plugin code + machine layout + `remotely-save` credentials), `.smart-env/` (private embeddings) | The second brain must be durable, reviewable and available to future sessions; app state and credentials must not be | Version control |
| D-008 | 2026-09-21 | Notes about **future** work (04, 05, 06, 07, 10, 11, 15) are marked `status: requirements-only` / `provisional-only` / `undecided` in frontmatter and state explicitly that they contain no decisions | Prevents a later session mistaking a written requirement for an approved design — the failure mode `CLAUDE.md` §29 warns about | Notes 04–15 |
| D-007 | 2026-09-21 | **Vault structure confirmed** as the 21 notes of `CLAUDE.md` §28, in `vault/`, all carrying YAML `aliases:` and linking back to 00 / 01 / 17 / 18 | Stage 2 structure approved by the user; Graphify may run against it once the user authorises | Whole vault |
| D-006 | 2026-09-21 | Vault notes use **numbered filenames** (`01 - …`) per `CLAUDE.md` §28, **plus a YAML `aliases:`** entry carrying the bare title, so both `[[01 - Existing Yoyo Gym Audit]]` and `[[Existing Yoyo Gym Audit]]` resolve | §27 link names and §28 filenames conflicted; aliases satisfy both without renaming either | All vault notes |
| D-005 | 2026-09-21 | Vault notes live in **`vault/`** at the repository root, not scattered at root level | Keeps 21 planned notes out of the source tree; Obsidian resolves `[[links]]` vault-wide regardless of folder. Renameable later at no cost | Vault structure |
| D-004 | 2026-09-21 | **Proceed to Stage 2 (audit note) before Stage 1 (tenancy)** — a deliberate reordering of `CLAUDE.md` §34 | The user wants the existing system documented before architecture is chosen, so the tenancy decision is made against written evidence rather than recollection | [[19 - Implementation Phases]] |
| D-003 | 2026-09-21 | The **repository inspection of 2026-09-21 is the source of truth** for existing single-gym behaviour, recorded in [[01 - Existing Yoyo Gym Audit]] | The prior audit is gone; code is the only remaining primary evidence | All future work |
| D-002 | 2026-09-21 | The previous single-gym discovery result is **permanently absent**. Do not reconstruct or fabricate it | Searched repo, vault, git history (added and deleted files) and the home directory — it does not exist on this machine | `CLAUDE.md` §29 |
| D-001 | 2026-09-21 | **`CLAUDE.md` v2 approved as written**, after three verified corrections (24 tables not 25; 23 guarded routes not 24; store compliance is Stage 10 not Stage 9) | Errors originated in the discovery report and would have become source-of-truth defects | `CLAUDE.md` §6, §8, §19 |

## Standing rules carried from `CLAUDE.md`

- **Memory of record** — this vault plus Graphify, never chat history (§26)
- **Failure protocol** — investigate from notes, logs and code; never guess (§27.1)
- **Stage gating** — one stage open at a time; the gate is the user's word (§34)
- **Protected surface** — nothing in [[03 - Protected Existing Functions]] changes without an
  explicit approved decision recorded here (§32)

## Rejected ideas

*(none yet — record rejections here with the reason, so they are not re-proposed)*

## Related

[[00 - Project Purpose]] · [[01 - Existing Yoyo Gym Audit]] · [[17 - Open Questions]] ·
[[19 - Implementation Phases]] · [[20 - Change History]] · [[03 - Protected Existing Functions]]
