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

---

## Pending approved change — removal of member payments (D-015)

The user decided on 2026-09-21 that **members will not pay through this system at all**. This is a
change to the protected surface, so `CLAUDE.md` §32 requires the five-part analysis below.
**Approved in principle; implementation has not started and must not start until Q-34 is answered.**

### Why it is necessary

The platform's revenue model is a flat subscription from gyms only (D-013). Member↔gym money is out
of scope; each gym collects member fees by its own means. Keeping an unused payment path would leave
live Paystack credentials, webhooks and money-moving code in a product that is not supposed to move
money.

### What it affects — verified, not assumed

| Component | Effect |
|---|---|
| `server/handlers/payments/{initialize,purchase-pack,verify,webhook}.js` | Removed |
| `server/lib/paystack.js` | Removed |
| `server/lib/activation.js` | **`activatePayment()` is the only automatic activation path — see the gap below** |
| `src/chatbot/components/PaymentScreen.jsx`, `src/pages/PaymentCallback.jsx` | Removed from the registration flow |
| `server/handlers/member/pay.js` + member-portal "pay outstanding" | Removed |
| `server/handlers/cron/billing.js` (recurring billing) | Becomes meaningless — recurring card billing cannot exist |
| `server/handlers/cron/retry-suspend.js` (failed-payment retry) | Becomes meaningless |
| `memberships.paystack_auth_code`, `payments.paystack_*` | Orphaned columns |
| Env: `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY` | No longer needed |
| **`payments` table, `admin/payments.js`, `admin/finance.js`, receipts** | ⚠️ **Should almost certainly STAY** — see below |

### The distinction that matters

**Removing online card payment is not the same as removing payment tracking.** Gyms still need to
know who has paid, who is in arrears, and to issue receipts — the entire membership lifecycle
(`active` / `expiring` / `expired` / `suspended`), the AR aging report, dunning email and receipt
PDFs all depend on the `payments` table. `admin/payments.js` already records **manual cash/EFT
payments**, which is exactly the mechanism a gym collecting fees outside the software needs.

**Recommendation: remove the Paystack/online-payment path; keep the `payments` table, manual
payment capture, AR aging, dunning and receipts.** Confirm before implementing.

### ⚠️ The activation gap — Q-34, blocking

Verified in code on 2026-09-21:

- `activatePayment()` (`server/lib/activation.js`) sets `payments → received`,
  `memberships → active` and `members → active`. It is called from **exactly two** places, both
  Paystack: `payments/verify.js:40` and `payments/webhook.js:59`.
- **`admin/payments.js` POST does NOT activate anyone.** It inserts a `payments` row with
  `status:'received'` and stops — it never touches `members.status` or `memberships.state`.
- The only manual activation paths that work today are `admin/member-action.js` `renew`
  (sets membership `active`, extends `end_date`, sets member `active`) and
  `PATCH /api/admin/member` `{status}` (sets member status **only**, not membership state).

**Therefore: remove Paystack and a newly registered member is stranded at `status:'new'` forever**,
because the registration flow's terminal step disappears and recording a cash payment does not
activate them. This must be designed, not discovered during implementation. Options, none chosen:

1. Make manual payment capture activate the member (mirror `activatePayment()` minus Paystack).
2. Add an explicit "Activate member" admin action.
3. Auto-activate on registration and let the gym suspend non-payers.

### Risks

Membership lifecycle breakage (above) · orphaned data in `payments` for gyms already live ·
two crons left as dead code if not also removed · loss of the only automated revenue-collection
mechanism, which gyms may currently rely on · **any gym already running this in production with
real Paystack keys would lose working functionality on deploy**.

### Rollback

Git revert of the removal commit restores the code, but **not** any Paystack configuration deleted
from Vercel env, and not transactions that failed to process while it was absent. Rollback is
therefore cheap in code and non-trivial in operations — do this behind a flag first if any gym is
live.

### Tests required

New: manual-payment-capture → member activation · registration completes to an active member with no
payment step · membership lifecycle transitions without Paystack · AR aging and dunning still
correct from manually captured payments. Existing 42 tests must still pass (`pricing.test.js` is
unaffected — pricing is not payment).

---

## What the platform may do

Additive work around this surface is fine: new tables, new endpoints under new paths, new pages,
a platform-side panel, a gym registry. What is **not** fine is modifying the files above to make
the platform easier to build. If the platform requires a change here, that is a decision for
[[18 - Decision Log]], not an implementation detail.

## Related

[[00 - Project Purpose]] · [[01 - Existing Yoyo Gym Audit]] · [[02 - Confirmed Existing Features]] ·
[[13 - Authentication and Roles]] · [[14 - Security and Privacy]] · [[17 - Open Questions]] ·
[[18 - Decision Log]]
