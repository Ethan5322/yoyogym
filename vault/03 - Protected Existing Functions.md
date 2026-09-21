---
aliases: ["Protected Existing Functions", "Do Not Change"]
tags: [protected, safety, existing-system]
stage: "Stage 2"
status: binding
updated: 2026-09-21
---

# 03 — Protected Existing Functions

The do-not-touch surface, mapped to actual files so "do not change member login" has an address.
Binding via `CLAUDE.md` §32. Changing anything here requires an approved entry in
[[18 - Decision Log]] stating **why, what it affects, the risk, the rollback, and the tests**.

## The protected surface

| Protected behaviour | Files that implement it | Why it is fragile |
|---|---|---|
| **Member registration** | `server/handlers/public/register.js`, `src/chatbot/**` (flow, engine, validators, 12 components), `shared/pricing.js`, `shared/countries.js` | Server-side pricing recomputation is the anti-fraud control. Touching the flow risks breaking PAR-Q, agreements or the identifier generation |
| **Member login** | `server/handlers/member/login.js`, `server/lib/memberauth.js` | Number + phone is the *only* member credential. There is no password reset path to fall back on |
| **Member face login** | `server/handlers/member/face-login.js`, `server/lib/facematch.js`, `server/lib/facedb.js` | Thresholds and the person-level margin are tuned; changing either silently causes false accepts or lockouts |
| **Admin/owner login** | `server/handlers/auth/login.js`, `server/lib/auth.js` | Lockout counters, generic errors and the 8h JWT are the account-security posture |
| **RBAC** | `server/lib/auth.js` `requireRole()`, every `server/handlers/admin/*.js`, `src/components/ProtectedRoute.jsx` | Enforcement is server-side in 37 handlers; the frontend guard is cosmetic. Weakening one handler is invisible in the UI |
| **Admin routes** | `src/App.jsx` lines 70–93, `api/admin/[...path].js` | 23 guarded routes; the router is a fixed key map — renaming a key 404s the page |
| **Database structure** | `db/schema.sql`, `db/migrations/*` | 24 tables, FK cascade/set-null semantics encode the POPIA erasure design |
| **Payment logic** | `server/handlers/payments/*`, `server/lib/paystack.js`, `server/lib/activation.js` | Webhook does HMAC **and** independent re-verification; `activatePayment()` is idempotent. Both properties are easy to break accidentally |
| **PDFs and IDs** | `src/lib/pdf/**`, `idcard.js`, `receiptPdf.js`, `credentialPdf.js`, `staffContractPdf.js`, `boardReportPdf.js`, `mulesooCredit.js`, `barcode.js` | Client-side jsPDF; layout and the agency lockup are client deliverables |
| **Identifiers** | `server/lib/identifiers.js` | `GYM-YYYY-XXXXXX`, `STF-`, `TRN-`, 8-char codes — printed on physical cards already in circulation |
| **QR behaviour** | `src/pages/admin/QrCodes.jsx`, `server/handlers/public/scan.js`, `src/pages/PublicProfile.jsx`, `scripts/generate-qr.js`, `qr/*` | Printed codes exist in the physical world; changing a URL orphans them |
| **Trainer behaviour** | `server/handlers/admin/{trainers,clients,training-session}.js` | Trainers see only their own clients — a privacy boundary, not a preference |
| **Roles** | `owner`, `manager`, `reception`, `trainer` in `server/lib/auth.js` | Stored in `admin_users.role` and baked into JWTs already issued |
| **Deployment model** | `vercel.json`, `.env.example`, the 6-router layout | Logic sits outside `api/` specifically to stay inside plan function limits |
| **Auth model** | JWT with `audience: 'member'` separating member from admin tokens | The audience check is what stops a member token reaching admin endpoints |
| **Production env vars** | Vercel project settings, `.env` (git-ignored) | Rotating `JWT_SECRET` invalidates every live session |

## Load-bearing invariants

Break any of these and the security model fails quietly rather than loudly:

1. **The browser never talks to Supabase.** RLS is enabled with **zero policies** — default-deny. It
   is safe *only* because the service-role key stays server-side. → [[14 - Security and Privacy]]
2. **Pricing is recomputed server-side** on every registration and renewal.
3. **`activatePayment()` is idempotent** — webhook and verify can both fire for one payment.
4. **Face matching needs threshold *and* person-level margin.** The margin prevents confident
   misidentification; a threshold alone does not.
5. **Member and admin tokens are separated by JWT `audience`.**
6. **Notification failure never breaks a transaction** — channels return `{ok:false}`, never throw.
7. **Analytics failure never blocks a page** — `scan.js` swallows its own errors.

## What the platform may do

Additive work around this surface is fine: new tables, new endpoints under new paths, new pages,
a platform-side panel, a gym registry. What is **not** fine is modifying the files above to make
the platform easier to build. If the platform requires a change here, that is a decision for
[[18 - Decision Log]], not an implementation detail.

## Related

[[00 - Project Purpose]] · [[01 - Existing Yoyo Gym Audit]] · [[02 - Confirmed Existing Features]] ·
[[13 - Authentication and Roles]] · [[14 - Security and Privacy]] · [[17 - Open Questions]] ·
[[18 - Decision Log]]
