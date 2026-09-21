---
aliases: ["Member Payment Removal Design", "Payment Removal", "Paystack Removal"]
tags: [design, protected-surface, payments, proposed]
stage: "Payment-removal slot — DESIGN ONLY"
status: "PROPOSED — not implemented, not approved"
updated: 2026-09-21
---

# 21 — Member Payment Removal Design

> **Documentation only.** Nothing in this note has been implemented. No file has been deleted,
> changed or created. Paystack is still fully in place. This is the design to be reviewed **before**
> the payment-removal slot opens.
>
> Governing decisions: **D-015** remove member payments · **D-017** manual capture activates ·
> **D-018** keep tracking (Q-39 confirmed) · **D-019** no live gyms · **D-020** platform uses
> Paystack · **D-021** keep `server/lib/paystack.js`.

## 1. What this change actually is

Not a deletion. **Activation is coupled to payment**, so removing the online payment path is a
change to the *membership lifecycle*. The one-line statement of the change:

> Remove the **online card** path (Paystack, member-facing). Keep **everything that records,
> reports and chases money**. Make **manual cash/EFT capture** the thing that activates a member.

### The path already exists and is proven

`src/pages/Register.jsx:55-62` **[C]**:

```js
// Manual (staff) registration takes payment offline -> straight to success.
completeView =
  !manual && result.amount_due_today > 0
    ? <PaymentScreen result={result} />
    : <SuccessScreen result={result} />;
```

**Staff-side registration already skips payment entirely and goes to the success screen.** The
removal is therefore mostly *"make every registration take the `manual` branch"* — a path that is
already written, already used, and already works. This materially lowers the risk of the change.

---

## 2. Complete inventory — every Paystack touchpoint

21 files reference Paystack. Enumerated by `grep -rniE "paystack"` across the repository on
2026-09-21, excluding `node_modules/`, `dist/`, `vault/` and `graphify-out/`.

### 2.1 Files to DELETE (6)

| File | What it is |
|---|---|
| `server/handlers/payments/initialize.js` | Start a member transaction |
| `server/handlers/payments/verify.js` | Confirm by reference → calls `activatePayment()` |
| `server/handlers/payments/webhook.js` | Paystack server-to-server → calls `activatePayment()` |
| `server/handlers/payments/purchase-pack.js` | Buy a session pack online |
| `src/chatbot/components/PaymentScreen.jsx` | The member-facing checkout screen |
| `src/pages/PaymentCallback.jsx` | Post-checkout return page |

`api/payments/[...path].js` — **delete the whole router** (all four of its routes go). This also
frees one of the six Serverless Function slots.

### 2.2 Files to CHANGE (9)

| File | Change | Care needed |
|---|---|---|
| `server/lib/activation.js` | Keep `activatePayment()` but drop the Paystack argument and the `paystack_auth_code` write. It becomes the shared "mark paid → activate" routine called by manual capture | **Keep it idempotent.** That property is load-bearing |
| `server/handlers/admin/payments.js` | POST currently inserts a `payments` row and **activates nobody**. Must now call the activation routine → implements **D-017** | The single most important change in this set |
| `server/handlers/cron/billing.js` | **Split, do not delete.** `run()` (Paystack debit) goes; **`runReminders()` stays** — it reads `next_billing_date` and emails, touches no Paystack, and is entirely valid for cash collection | Deleting this file would silently kill billing reminders |
| `server/handlers/cron/retry-suspend.js` | Paystack retry goes. **The suspension half is worth keeping** as overdue→suspend — see Q-42 | Do not delete blind |
| `server/handlers/cron/daily.js` | Remove the `billing` job from the orchestrator; keep `billing_reminders`; adjust `retry_suspend` | Orchestrator array at lines 24-26 |
| `src/pages/Register.jsx` | Always take the `SuccessScreen` branch; drop the `PaymentScreen` import | Trivial — the branch exists |
| `src/pages/MemberPortal.jsx` | Remove the `PayBalance` component (~line 696-720) and its `/member/pay` call | Leave the outstanding-balance **display** — members should still see what they owe |
| `src/App.jsx` | Remove the `/payment/callback` route and lazy import (lines 12, 66) | |
| `server/handlers/member/pay.js` | Delete the handler **and** its entry in `api/member/[...path].js` | Router key `pay` |
| `.env.example` | Remove the member-facing Paystack block; **add a platform-side note** per D-020 | |

### 2.3 Files that must remain UNTOUCHED

| File / area | Why |
|---|---|
| **`server/lib/paystack.js`** | **D-021.** Platform subscriptions need these exact primitives, including the proven webhook hardening (HMAC + independent re-verify). Delete nothing |
| `db/schema.sql`, `db/migrations/*` | **No migration in this slot.** `payments.paystack_reference`, `payments.method`, `memberships.paystack_auth_code` become unused but stay. Orphaned columns are harmless; a destructive migration is not |
| `gym.payments` table + indexes | **D-018** — records, arrears, aging, receipts all read it |
| `server/handlers/admin/finance.js` | AR aging + dunning — explicitly preserved |
| `src/lib/receiptPdf.js` | Receipts — explicitly preserved |
| `server/handlers/admin/plans.js`, `addons.js`, `src/pages/admin/Catalog.jsx` | Per-gym plans and add-ons — explicitly preserved |
| `shared/pricing.js`, `tests/pricing.test.js` | **Pricing is not payment.** Registration still computes what is owed; it simply is not charged online |
| `src/lib/fx.js` | Only a *comment* mentions Paystack; the currency-hint logic is unrelated |
| `scripts/{business-guide,sales-playbook,delivery-stepbystep,owner-manual}.js` | PDF generators whose prose mentions Paystack. **Out of scope** — a separate documentation refresh, not a code change |
| `CLAUDE (3).md`, `DELIVERY.md` | Historical documents. `DELIVERY.md` will need a refresh, but not in this slot |
| All other 20 gym tables, auth, RBAC, QR, face, notifications | Untouched |

### 2.4 Environment variables

`PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`. **Verified present and non-empty in local `.env`**
(presence checked only — **values were not read**).

**Q-43 is now answered (D-025): the platform reuses this same Paystack account and these keys.**
So the correct action is **move, not delete**:

- Remove them from gym-side deployments and from `.env.example`'s gym-facing section.
- **Keep the credentials.** They become the *platform's* billing keys.
- Classify them as a **platform-level secret** — never stored in `gym_secrets` (D-022).
- Do not revoke or rotate them during the removal; that would break platform billing before it is
  built.

### 2.5 Tests

**No existing test touches Paystack or payments** — verified, `tests/` matched nothing.
`pricing.test.js` tests pricing maths, which is unaffected.

**New tests required** (the change currently has zero coverage):

1. Recording a manual cash/EFT payment sets member `active` **and** membership `active`
2. The activation routine remains **idempotent** — capturing twice does not double-extend
3. Registration completes to a success screen with no payment step, for both staff and public
4. AR aging and dunning still compute correctly from manually captured payments
5. `/api/payments/*` returns 404 after removal
6. All 42 existing tests still pass

---

## 3. Database impact

**No schema change in this slot.** Nothing is dropped, renamed or migrated.

| Object | Fate |
|---|---|
| `gym.payments` | **Kept in full.** Rows, indexes, everything |
| `payments.method` | Values narrow from `paystack \| paystack_debit \| cash \| eft` to `cash \| eft`. Column unchanged |
| `payments.paystack_reference` | Becomes permanently null. Column retained |
| `memberships.paystack_auth_code` | Becomes permanently null. Column retained |
| `payments.retry_count`, `next_retry_at` | Retained; meaningful only if Q-42 keeps suspension |

**What happens to existing payment records: nothing.** They are preserved intact, remain readable,
and continue to feed AR aging, receipts and reporting. Because **no gym is live (D-019)**, in
practice there are no production rows to preserve — but the design does not depend on that being
true, which is the right posture.

A later cleanup migration could drop the orphaned columns. **It is deliberately excluded here** —
dropping columns is irreversible and buys nothing.

---

## 4. Migration and rollback risks

### Risk register

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | **Members stranded at `status:'new'`** if activation is not wired before payment is removed | **Critical** | Implement D-017 (`admin/payments.js` activates) **first**, verify, *then* remove. Never the other way round |
| 2 | Deleting `billing.js` kills `runReminders()` | High | Split the file; keep reminders |
| 3 | Deleting `retry-suspend.js` silently ends overdue suspension | Medium | Q-42 first |
| 4 | Deleting `paystack.js` forces a rewrite for platform billing | Medium | **D-021** — keep it |
| 5 | Removing the outstanding-balance *display* along with the pay button | Medium | Remove `PayBalance` only; keep the balance figure |
| 6 | A destructive migration dropping Paystack columns | High | Out of scope by design |
| 7 | Losing the hardened webhook pattern | Medium | Preserved inside `paystack.js` |
| 8 | Stale docs telling gyms they can take card payments | Low | Separate documentation refresh |

### Rollback

`git revert` of a single focused commit restores every deleted file, because **no migration runs and
no data is destroyed**. What revert does **not** restore: Paystack environment variables removed
from Vercel, and any webhook URL deregistered in the Paystack dashboard — both must be written down
before removal so they can be re-entered.

**Because no gym is live (D-019), rollback is close to free.** This is the cheapest moment this
change will ever have. Doing it before launch avoids a feature flag, a staged cutover, and an
in-flight-transaction migration entirely.

### In-flight transactions

**None.** D-019 confirms no gym is live and no member has ever paid through the system. There are no
pending transactions, no saved authorization codes and no webhooks in flight. Verified as far as is
possible from this side: the code is present and the local keys are set, but no production
deployment is serving members.

---

## 5. Recommended sequence

```text
1. Wire activation first    admin/payments.js POST → activation routine (D-017)
                            + tests. Nothing removed yet. Fully reversible.
2. Verify                   register → capture cash → member is active. 42 tests green.
3. Remove the online path   delete the 6 files + payments router; change the 9.
4. Split the crons          keep runReminders; resolve Q-42 for suspension.
5. Clean config             env vars out of gym deployments; .env.example updated.
6. Docs                     DELIVERY.md and the PDF scripts, separately.
```

**Step 1 before step 3 is not a preference — it is the difference between a safe change and
stranding every new member.**

## 6. Open questions this design raises

- **Q-42** — keep overdue→suspension? `retry-suspend.js` couples Paystack retry with suspension.
  Suspension is valuable for cash-collecting gyms and arguably part of the preserved "arrears"
  scope. Recommend keeping it as `suspend-overdue.js`. **Needs a decision.**
- **Q-43** — will platform billing (D-020) reuse the existing Paystack account and keys, or a new
  MuleSoo platform account? Determines whether the current credentials are retired or migrated.
- **Q-44** — should the member portal still show an outstanding balance with no way to pay it
  online? Recommend **yes** — visibility is useful, the call to action becomes "pay at reception".

## Related

[[03 - Protected Existing Functions]] · [[01 - Existing Yoyo Gym Audit]] ·
[[11 - Subscription Decisions]] · [[12 - Database Architecture]] · [[16 - API Documentation]] ·
[[17 - Open Questions]] · [[18 - Decision Log]] · [[19 - Implementation Phases]] ·
[[20 - Change History]]
