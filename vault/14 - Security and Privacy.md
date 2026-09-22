---
aliases: ["Security and Privacy", "Security Requirements"]
tags: [security, privacy, popia, existing-system]
stage: "Stage 2"
status: mixed
updated: 2026-09-22
---

# 14 — Security and Privacy

## Current posture — confirmed

| Control | State | Evidence |
|---|---|---|
| Service-role key server-only | **[C]** | `server/lib/supabase.js` — explicit "never import into frontend" |
| Browser never touches Supabase | **[C]** | Frontend calls `/api/*` only |
| RLS enabled, **zero policies** → default-deny | **[C]** | `db/schema.sql:19-22` — deliberate |
| Admin/member token separation | **[C]** | JWT `audience: 'member'` |
| Password hashing | **[C]** | bcrypt, cost 12 |
| Brute-force lockout | **[C]** | 5 attempts / 15 min |
| Rate limiting | **[C]** | `server/lib/ratelimit.js`, Upstash-ready, in-memory fallback |
| Server-side pricing | **[C]** | `register.js` recomputes from the DB |
| Webhook HMAC + independent re-verify | **[C]** | `payments/webhook.js` refuses bad signatures |
| Idempotent activation | **[C]** | `server/lib/activation.js` |
| Audit trail | **[C]** | `audit_log` + `server/lib/audit.js` |
| Security headers | **[C]** | `vercel.json`: nosniff, SAMEORIGIN, HSTS, Referrer-Policy, `camera=(self)` |
| Error capture | **[C]** | `server/lib/observability.js` |
| Generic auth errors | **[C]** | Never reveals account existence |
| 2FA | **[M]** | Explicitly deferred |
| Integration / auth tests | **[M]** | 42 tests are pure-logic only |

## The load-bearing invariant

> The entire default-deny RLS posture is safe **only because the browser never talks to Supabase
> directly.**

Any design that puts a Supabase client in a mobile app invalidates it and **requires real RLS
policies first** (Q-20). This is the single most consequential security fact in the project.

## Known weak points — stated honestly

1. ⚠️ **`/api/document` — now a BLOCKING pre-launch fix (D-034).** `membership_number` +
   `verification_code` returns a member's full record with **no session**. Sound within one gym
   where only the member holds both. But under app-based routing (D-036) **any client can aim it at
   any gym**, so the guessing surface multiplies by the number of gyms. Must be session-bound,
   per-gym rate-limited, or both, **before launch**. The verification code is also effectively a
   **reusable secret**, which constrains what a member-ID QR may carry → [[09 - QR-Code Architecture]].
2. 🔴 **Shared `JWT_SECRET` across admin and member tokens — and THE AUDIENCE CLAIM IS NOT
   CHECKED** **[C]**. **This entry was wrong until 2026-09-22 and is corrected here.**

   It previously said separation "rests entirely on the `audience` claim". It does not rest on
   anything: `server/lib/auth.js` `verifyToken()` calls `jwt.verify(token, JWT_SECRET)` with **no
   audience option**, so the `aud: 'member'` that `memberauth.js` sets is read and ignored. **A
   member token is a structurally valid admin token.** Reproduced against the real signing code,
   not inferred — see [[17 - Open Questions]] §0.2 (F-1).

   The exposure is the 4 handlers that call `authenticate()` with no role check; the other 71
   call sites go through `requireRole`, which refuses a payload with no `role`. That is luck, not
   a control. **A one-line backward-compatible fix is written up and awaiting approval.**

   D-016's per-gym secret was also superseded by D-096 (schema-per-gym, one project, one secret),
   so the tenant separation that entry claimed no longer comes from the key either — it comes from
   the resolver, which is what `tests/isolation.test.js` exists to defend.
3. **Biometric data in Postgres** **[C]**. Face templates are `jsonb` in `members` — no object
   store, no separate encryption at rest beyond the database's own. **No retention policy exists**
   (Q-16), and data is already held. **D-042 bounds the exposure:** 1:N matching stays server-side,
   so a gym's member face gallery never reaches a device; only a member's own template may be
   matched on their own phone.
4. **`settings` is an unvalidated free-form key space** **[P]** — see [[12 - Database Architecture]].
5. **No automated POPIA erasure** **[P]**. `request-deletion.js` flags a record; deletion is manual.
   FK cascades make erasure *possible*, not *automatic*.
6. **Member accounts have no recovery path** **[C]** — no password, so no reset; a changed phone
   number requires staff intervention.

## Retention policies — DECIDED 2026-09-21

The first written retention policies for this project. Both were previously **[M] missing**.

| Data | Policy | Mechanism |
|---|---|---|
| **Member face templates** (D-055) | Deleted when the member leaves, or on request. Re-enrolment always available | FK cascade on member delete already does this |
| **Owner application documents** (D-054) | Rejected: purged after a ~90-day appeal window. Approved: kept while the gym trades, deleted a set period after it leaves | `application_documents.retention_until` |

## Multi-country — D-056 changes the compliance surface

Country is now first-class from the start. The system today is **South-Africa shaped**: SA ID Luhn
validation, ZAR, POPIA consent, CPA contract text.

**What D-015 already solved.** Removing member payments cleared the hardest multi-country problem
before it was asked — per-country payment gateways for member fees. Gyms collect locally by their
own means, so currency is now display and record-keeping only (D-057).

**What is left, and must be verified rather than assumed:**

- National identity validation beyond the SA ID / passport split
- Per-jurisdiction privacy law — POPIA is not GDPR and is not Ethiopia's regime
- Per-jurisdiction consumer-contract text (CPA is South African)
- **Whether the platform's billing provider operates in each target country** — check the provider's
  own documentation, never from memory

## POPIA / South Africa

**[P]** The system is built for South Africa: POPIA consent (`popia_consent_at`), SA ID numbers
with Luhn validation, ZAR charging, CPA-aligned contract text, PAR-Q health screening.
Consent is captured; cascade deletes support erasure; a deletion-request endpoint exists.

Missing for full compliance: automated erasure, retention schedules, a documented biometric policy,
and any jurisdiction beyond South Africa (Q-18).

## Security risks introduced by D-016 (Stage 3)

> **The headline trade-off, stated plainly.** D-016 buys **physical data isolation** at the price of
> making the **application a shared trust boundary**. Under deployment-per-gym, compromising the app
> reached one gym. Under a shared application, the running process can reach **every** gym's
> credentials. The data is separate; the code path is not. This was accepted knowingly — it is not a
> flaw to paper over, and it makes the resolver and the secret cache the two most security-critical
> pieces of code in the platform.

| # | Risk | Why it is serious here | Mitigation direction |
|---|---|---|---|
| R-1 | **Resolver bug serves gym A's client to gym B** | Cross-tenant data leak of health and biometric data. The resolver replaces RLS as the isolation mechanism | **Updated for D-035/D-036:** the client may *name* a gym but is granted nothing on that name alone — credentials are verified against that gym's own database and `JWT_SECRET`. Never a default-gym fallback. Automated cross-tenant test is the Stage 5 gate |
| R-2 | **Client-cache key confusion** | The pooled Supabase client is keyed on `gym_id`; a stale or wrong key hands over the wrong database | Key on gym id + connection id; evict on any connection or secret change; never key on anything client-supplied |
| R-3 | **All gyms' secrets reachable from one process** | A single RCE or SSRF in the shared app exposes the fleet | Short TTL in memory; fetch per request scope; never log or serialise. **Materially reduced by D-044/D-046:** the platform admin panel is a separate deployment that holds **no** gym credentials, so only the gym-serving app and the migration orchestrator ever touch them |
| R-4 | **Secret value written into `gym_secrets`** | Turns the metadata database into a credential store | Documented invariant (§4.4 of [[12 - Database Architecture]]); code review; treat any occurrence as an incident requiring rotation, not deletion |
| R-5 | ~~Platform staff over-reach~~ | — | **Closed by D-044: the platform owner can NEVER open a gym's admin panel.** No impersonation, no support access, no exceptions. The `support` role sees connection health and metadata only |
| R-6 | **Cross-gym token replay** | A token from gym A accepted by gym B | Per-gym `JWT_SECRET` (already the design) **plus** a gym id claim verified against the resolved gym |
| R-7 | **Connection-pool exhaustion** | Thousands of clients from one serverless app — a DoS and a correctness risk | Q-37, unresolved; bounded LRU with eviction |
| R-8 | **Document upload is new attack surface** | Applications carry identity documents; object storage does not exist today | Q-24 / Q-12 — retention, scanning, access control all undesigned |
| R-9 | **Platform audit log tampering** | It is the only record of approvals, suspensions and secret access | Append-only by convention and by permission; no update/delete path in any handler |
| R-10 | **Migration orchestrator holds fleet-wide write access** | It can alter every gym's schema | Separate credential path, dry-run mode, checksum drift detection (§4.6) |

**Platform billing note (D-020):** platform subscriptions run on **Paystack**, charging gyms. No
member ever appears in `platform_invoices`. Platform Paystack credentials are a **platform-level**
secret and must never be stored in `gym_secrets` alongside per-gym credentials.

## Requirements for the platform

Per `CLAUDE.md` §21 — the frontend must **never** be trusted to define role, **gym identity**,
tenant access, payment amount, membership status or permission level. All of it server-side.

New surfaces the platform introduces, each with new risk:

- **Document upload** (owner applications) — file storage does not exist today; new attack surface,
  new retention duty → Q-12, Q-24
- **Cross-gym queries** in the platform panel — the exact thing tenant isolation must prevent
- **Gym resolution** — under D-036 a client *does* name its gym, and that is safe **only because**
  credentials are then verified against that gym's own database and signing secret (D-035). Isolation
  never rested on hiding which gym was asked for
- **Mobile session storage** — secure storage, not `localStorage`

## Never expose

Supabase service-role keys · `JWT_SECRET` · Paystack secret keys · Brevo secrets · CallMeBot
secrets · biometric data · health data · passwords · reusable verification secrets.

## Related

[[00 - Project Purpose]] · [[01 - Existing Yoyo Gym Audit]] · [[13 - Authentication and Roles]] ·
[[12 - Database Architecture]] · [[03 - Protected Existing Functions]] · [[06 - Tenant Architecture]] ·
[[10 - Mobile App]] · [[15 - Store Compliance]] · [[17 - Open Questions]] · [[18 - Decision Log]]
