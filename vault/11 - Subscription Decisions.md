---
aliases: ["Subscription Decisions", "Subscriptions"]
tags: [subscriptions, commercial, future, provisional]
stage: "Stage 2"
status: provisional-only
updated: 2026-09-21
---

# 11 — Subscription Decisions

> **Partly decided now.** Settled: the platform charges gyms a **flat subscription only** (D-013),
> billed through **Paystack** (D-020), and tiers live as **data** in `platform_plans`
> ([[12 - Database Architecture]] §4.5). Still **provisional**: the tier names, member limits,
> prices and feature split below. Per `CLAUDE.md` §18: do not implement subscription billing yet,
> and never hard-code limits or prices.

## Settled

| | Decision |
|---|---|
| Who pays | **Gyms pay the platform.** Members never pay the platform (D-013) |
| How much the platform takes of member fees | **Nothing.** No revenue share (D-013) |
| Provider | **Paystack**, for gym subscriptions (D-020) |
| Where limits and prices live | `platform_plans` rows — data, not code |
| Member payments in the gym app | **Removed** (D-015/D-018); each gym runs its own plans and collects fees its own way |

## Gym dunning policy — DECIDED (D-026, D-027)

```text
Gym does not subscribe, or a subscription payment fails
        │
        ▼
   2-DAY WARNING          subscription status 'past_due'; gym still has access
        │                 warning email to the gym owner
        ▼
   SUSPEND                gyms.status = 'suspended' → NO platform access
        │
        ▼
   DATA RETAINED          the gym's Supabase project, database and every row
                          stay exactly as they are. Nothing is deleted.
                          Reactivation is a status change, not a re-provision.
```

**D-027 is an operational invariant, not a preference.** A billing event must never destroy member
data. The gym remains POPIA responsible party for that data throughout suspension, and destroying it
because an invoice went unpaid would be both a compliance failure and unrecoverable.

**Schema consequence** for the approved-but-unbuilt model ([[12 - Database Architecture]] §4.5):
`platform_subscriptions` needs a **grace-window field** — e.g. `grace_ends_at timestamptz` — so the
2-day warning is data rather than a hard-coded constant, consistent with §18. Cheap to add now,
since no table has been created yet.

> Note the symmetry worth keeping straight: **Paystack leaves the member-facing gym app and
> reappears on the platform side.** Same library, opposite direction of money. `paystack.js` is
> therefore kept, not deleted (D-021).

Subscriptions here mean **gyms paying the platform** — not members paying gyms, which already
exists and works ([[01 - Existing Yoyo Gym Audit]] §11).

## Provisional tiers (user discussion, unratified)

| Tier | Active members | Locations | Feature set |
|---|---|---|---|
| Basic | ~40 | 1 | Smallest permitted set — **undefined** |
| Medium | ~150 | 1 | Fewer functions — **undefined** |
| Prime | ~500 | 1 | Complete existing system + approved additions |

These are **[?]** until the feature inventory ([[02 - Confirmed Existing Features]]) and the
architecture ([[06 - Tenant Architecture]]) are settled.

## What the feature inventory implies

[[02 - Confirmed Existing Features]] lists roughly 60 discrete capabilities. Splitting them into
three tiers is a **product decision**, not a technical one, but two technical facts constrain it:

1. **Gating is not free.** There is no feature-flag mechanism in the codebase today **[M]**. Every
   gated feature needs an enforcement point, server-side, that cannot be bypassed by the client
   (`CLAUDE.md` §21).
2. **Member-count limits need a counter and an enforcement moment.** `members` has a `status`
   column but no per-gym cap logic **[M]**. Where the limit bites — registration, activation, or
   billing — is undecided and user-visible.

## Open questions

| # | Question | Blocks |
|---|---|---|
| Q-04 | Tiers, prices, currency, billing cadence | Stage 7 |
| Q-05 | Does the platform take a share of member payments, or charge gyms only? | Payment architecture |
| Q-06 | Trial period; payment method required during trial? | Stage 6 |
| Q-07 | What happens on non-payment — suspend, degrade, or read-only? | Stage 7 |
| Q-08 | Purchased in the mobile app or on the web? | Collides with Q-14 |
| Q-14 | Store rules on digital subscriptions may prohibit external payment pages | Stage 10 |

**Q-05 is the consequential one.** Charging gyms a flat subscription is a simple SaaS billing
problem. Taking a cut of member payments means Paystack split payments or subaccounts, per-gym
merchant onboarding, and a materially different regulatory position. The existing code assumes
**per-gym Paystack keys** and the gym keeping 100% (`server/lib/paystack.js`) **[C]** — so a
revenue share is a change to the payment architecture, not a setting.

## Constraint from the protected surface

Member-facing payments are protected ([[03 - Protected Existing Functions]]). Platform
subscriptions must be built **alongside** them, not by modifying `payments/*` or `activation.js`.

## When implemented

Tier limits and prices must be **data** — a table or config read at runtime — never constants in
code (`CLAUDE.md` §18).

## Related

[[00 - Project Purpose]] · [[01 - Existing Yoyo Gym Audit]] · [[02 - Confirmed Existing Features]] ·
[[05 - Main Platform Admin Panel]] · [[07 - Owner Workflows]] · [[15 - Store Compliance]] ·
[[17 - Open Questions]] · [[18 - Decision Log]]
