---
aliases: ["Subscription Decisions", "Subscriptions"]
tags: [subscriptions, commercial, future, provisional]
stage: "Stage 2"
status: "partly decided — tiers still provisional"
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

### The full lifecycle, including the end (D-070, D-071)

```text
Approved  →  30-DAY FREE TRIAL (D-070)          you pay the hosting
              │  no payment method required
              ▼
          Payment due
              │
       ┌──────┴──────┐
    paid           not paid
       │               │
       ▼               ▼
    ACTIVE        2-day warning (D-026)
                       │
                       ▼
                  SUSPENDED — no platform access, DATA INTACT (D-027)
                       │  email warnings during this window
                       │  90 days
                       ▼
                  DELETED (D-071) — the gym's Supabase project is removed
```

> ⚠️ **The exposure, stated in full: 30 days trial + 90 days suspended = up to 120 days of Supabase
> compute for a gym that never pays anything.** Multiply that by your trial-to-paid conversion rate
> to get the real cost of the free trial. This is why U-2 (per-project cost) matters — see
> [[12 - Database Architecture]] §7b for the same lesson on secrets pricing.

**D-027 and D-071 are not in conflict.** D-027 forbids *a billing event* from destroying data —
suspension alone deletes nothing, ever. D-071 adds a defined end to retention, reached only after 90
further days and repeated warnings.

**Schema consequence** for the approved-but-unbuilt model ([[12 - Database Architecture]] §4.5):
`platform_subscriptions` needs a **grace-window field** — e.g. `grace_ends_at timestamptz` — so the
2-day warning is data rather than a hard-coded constant, consistent with §18. Cheap to add now,
since no table has been created yet.

> Note the symmetry worth keeping straight: **Paystack leaves the member-facing gym app and
> reappears on the platform side.** Same library, opposite direction of money. `paystack.js` is
> therefore kept, not deleted (D-021).

Subscriptions here mean **gyms paying the platform** — not members paying gyms, which already
exists and works ([[01 - Existing Yoyo Gym Audit]] §11).

## U-2 ANSWERED — what a gym actually costs you (researched 2026-09-21)

From [Supabase pricing](https://supabase.com/pricing) and their
[billing FAQ](https://supabase.com/docs/guides/platform/billing-faq), not from memory.

### The floor

| Item | Cost |
|---|---|
| Pro plan, per **organisation** | **$25/month** |
| Compute credit included | **$10/month** — covers exactly **one** Micro project |
| **Every additional project** | **~$10/month minimum** (Micro: 1 GB RAM, shared) |
| Pro/Team projects auto-pausing | **Never.** Only Free-plan projects pause after a week idle |

> ### 💰 **The number that matters: a gym costs you ~$10/month in database hosting alone, forever.**
> That is the floor, before Vercel, email, support, or any profit — and before a gym's own usage
> pushes it off Micro.

### What that means at each scale

| Gyms | Supabase per month | Per year |
|---|---|---|
| 100 | **~$1,015** | ~$12,000 |
| 1,000 | **~$10,000** | ~$120,000 |
| 10,000 | **~$100,000** | **~$1,200,000** |

*(≈ $25 + gyms × $10 − $10 credit. At roughly R19/USD — an assumption that moves, not a fact.)*

### Three consequences that change decisions

**1. This prices the isolation decision.** D-014 (a database per gym) was made on privacy and POPIA
grounds and remains right for those reasons — but it is **not free**, and this is its invoice.
Pooling would have amortised it. That was the trade, now with a number on it.

**2. The Basic tier must clear ~$10/month just to break even on hosting.** At ~R19/USD that is about
**R190/month of pure cost** for a 40-member gym, before Vercel, Brevo, support or margin. Any Basic
price near R200 is break-even at best. **This is the constraint D-058 was waiting for.**

**3. The 30-day trial (D-070) costs ~$10 per trialling gym, and the full exposure is ~$40.**
30 days trial + 90 days suspended (D-071) = **up to 120 days × $10 = ~$40 of hosting for a gym that
never pays a cent.** At a 30% trial-to-paid rate, roughly **$93 of wasted trial cost is carried by
every gym that does convert**. A 14-day trial would have halved the first part.

> **Not a recommendation to change D-070 — the user chose 30 days knowing it doubled the carry.**
> It is the number that choice implies, recorded so it can be revisited with evidence if conversion
> comes in low.

### What could reduce it — unverified, do not assume

- **Supabase may offer partner or volume terms** at thousands of projects (U-4). **Ask them in the
  same conversation as U-1** — the project-cap question is already going to them.
- Deprovisioning abandoned trials **promptly** (D-071) is the single biggest lever fully in your
  control.
- Nothing else in the stack comes close to this line item.

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

| # | Question | Status | Blocks |
|---|---|---|---|
| Q-04 | Tiers, prices, currency, billing cadence | **open** | Stage 7 |
| Q-06 | Trial period; payment method required during trial? | **open** | Stage 6 |
| Q-08 | Purchased in the mobile app or on the web? | **open** | Collides with Q-14 |
| Q-14 | Store rules on digital subscriptions may prohibit external payment pages | **open** | Stage 10 |
| ~~Q-05~~ | Share of member payments vs gyms only | ✅ **flat subscription only** (D-013) | — |
| ~~Q-07~~ | What happens on non-payment | ✅ **2-day warning → suspend → data retained** (D-026/027) | — |

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
