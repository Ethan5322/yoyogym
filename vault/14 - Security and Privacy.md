---
aliases: ["Security and Privacy", "Security Requirements"]
tags: [security, privacy, popia, existing-system]
stage: "Stage 2"
status: mixed
updated: 2026-09-21
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

1. **`/api/document` is a two-secret bearer endpoint** **[P]**. `membership_number` +
   `verification_code` returns a member's full record with **no session**. Sound within one gym
   where only the member holds both; **must be re-reviewed before any cross-gym exposure** (Q-19).
   It also means the verification code is effectively a **reusable secret**, which constrains what
   a member-ID QR may contain → [[09 - QR-Code Architecture]].
2. **Shared `JWT_SECRET`** across admin and member tokens **[C]**. Separation rests entirely on the
   `audience` claim. Under a pooled tenancy model, one secret would span all gyms → Q-01.
3. **Biometric data in Postgres** **[C]**. Face templates are `jsonb` in `members` — no object
   store, no separate encryption at rest beyond the database's own. **No retention policy exists**
   (Q-16), and data is already held.
4. **`settings` is an unvalidated free-form key space** **[P]** — see [[12 - Database Architecture]].
5. **No automated POPIA erasure** **[P]**. `request-deletion.js` flags a record; deletion is manual.
   FK cascades make erasure *possible*, not *automatic*.
6. **Member accounts have no recovery path** **[C]** — no password, so no reset; a changed phone
   number requires staff intervention.

## POPIA / South Africa

**[P]** The system is built for South Africa: POPIA consent (`popia_consent_at`), SA ID numbers
with Luhn validation, ZAR charging, CPA-aligned contract text, PAR-Q health screening.
Consent is captured; cascade deletes support erasure; a deletion-request endpoint exists.

Missing for full compliance: automated erasure, retention schedules, a documented biometric policy,
and any jurisdiction beyond South Africa (Q-18).

## Requirements for the platform

Per `CLAUDE.md` §21 — the frontend must **never** be trusted to define role, **gym identity**,
tenant access, payment amount, membership status or permission level. All of it server-side.

New surfaces the platform introduces, each with new risk:

- **Document upload** (owner applications) — file storage does not exist today; new attack surface,
  new retention duty → Q-12, Q-24
- **Cross-gym queries** in the platform panel — the exact thing tenant isolation must prevent
- **Gym resolution** — if a client can assert which gym it is, isolation is already broken
- **Mobile session storage** — secure storage, not `localStorage`

## Never expose

Supabase service-role keys · `JWT_SECRET` · Paystack secret keys · Brevo secrets · CallMeBot
secrets · biometric data · health data · passwords · reusable verification secrets.

## Related

[[00 - Project Purpose]] · [[01 - Existing Yoyo Gym Audit]] · [[13 - Authentication and Roles]] ·
[[12 - Database Architecture]] · [[03 - Protected Existing Functions]] · [[06 - Tenant Architecture]] ·
[[10 - Mobile App]] · [[15 - Store Compliance]] · [[17 - Open Questions]] · [[18 - Decision Log]]
