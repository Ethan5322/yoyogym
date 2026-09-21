---
aliases: ["Subscription Decisions", "Subscriptions"]
tags: [subscriptions, commercial, future, provisional]
stage: "Stage 2"
status: provisional-only
updated: 2026-09-21
---

# 11 — Subscription Decisions

> **Nothing in this note is decided.** The title is inherited from the approved §28 list; the
> content is **provisional**. Per `CLAUDE.md` §18: do not implement subscription billing, and do
> not hard-code limits or prices.

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
