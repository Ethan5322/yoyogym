---
name: subscription-plans
description: Yoyo Gyms subscription tiers (BASIC/MEDIUM/PRIME), market research, pricing context, gap analysis and the owner "what else do you need" question. Use before any work on platform plans, pricing, entitlements, feature gating or member limits.
---

# Subscription plans — detail moved from CLAUDE.md §18

Moved verbatim from CLAUDE.md §18.1–18.3, 18.5 and 18.6 on 2026-09-24. The enforcement rules (§18.4) and "prices are never hard-coded" remain in CLAUDE.md and are binding.

### 18.1 What the market actually does — evidence, not assumption

Two models dominate gym-management software:

| Model | Who | Shape |
|---|---|---|
| **By member count, everything included** | Gymdesk, Mindbody, Zen Planner | $75 ≤50 members → $200 ≤400 |
| **By feature tier** | PushPress, TeamUp | Free / $159 / $229, then paid add-ons |

**The market's loudest complaint is add-on gouging** — a "$159/month" plan reaching $500–664/month
once the necessary modules are bought, and Gymdesk competes explicitly on *not* doing that.

Features the market consistently treats as **premium**: access control and hardware, marketing and
CRM ($20–329/mo), branded mobile apps ($39–100/mo), advanced analytics, multi-location.
Features it treats as **entry-level**: billing, scheduling, check-in, simple reporting.

**Consequence for Yoyo Gyms:** member count is the primary lever, because that is what this market
understands and it scales with the gym's own revenue. Feature gating is kept **deliberately light** —
enough to make upgrading worthwhile, not so much that the product feels crippled. **Yoyo's face
recognition maps exactly onto the market's "access control" premium category**, which makes it the
natural flagship of the top tier.

### 18.2 The three plans

**Every tier includes the whole of "core gym operation".** A gym that cannot register, check in,
charge and manage its members is not running; crippling that would produce bad software, not
upgrades.

| | **BASIC** | **MEDIUM** | **PRIME** |
|---|---|---|---|
| **Active members** | up to ~40 | up to ~150 | up to ~500 |
| **Locations** | 1 | 1 | 1 |
| Member registration (38-step flow, PAR-Q, agreements) | ✅ | ✅ | ✅ |
| Member list, 360 profile, quick actions | ✅ | ✅ | ✅ |
| Member portal (status, check-in, history, profile) | ✅ | ✅ | ✅ |
| Check-in — self, staff verification, today's overview | ✅ | ✅ | ✅ |
| Payment recording, receipts, arrears and aging | ✅ | ✅ | ✅ |
| Plans and add-ons catalog | ✅ | ✅ | ✅ |
| Gym settings, branding, logo | ✅ | ✅ | ✅ |
| Staff accounts and roles | ✅ | ✅ | ✅ |
| QR codes (gym and per-member) | ✅ | ✅ | ✅ |
| Membership card and ID card PDFs | ✅ | ✅ | ✅ |
| Automated member emails and reminders | ✅ | ✅ | ✅ |
| **Classes, bookings, waitlists, calendar** | ❌ | ✅ | ✅ |
| **Trainers and PT session logging** | ❌ | ✅ | ✅ |
| **Announcements and member messaging (inbox)** | ❌ | ✅ | ✅ |
| **Standard reporting** — attendance, revenue trend | ❌ | ✅ | ✅ |
| **Member progress tracking** | ❌ | ✅ | ✅ |
| **CSV import and export** | ❌ | ✅ | ✅ |
| **🔒 Face recognition — enrolment, face login, door scanner** | ❌ | ❌ | ✅ |
| **🔒 Visitors, incidents, access control** | ❌ | ❌ | ✅ |
| **🔒 Advanced analytics — churn, retention, peak hours, board PDF** | ❌ | ❌ | ✅ |
| **🔒 Bulk email broadcast (marketing)** | ❌ | ❌ | ✅ |
| **🔒 Referral programme** | ❌ | ❌ | ✅ |
| **🔒 Audit log** | ❌ | ❌ | ✅ |

**PRIME is the complete existing system.** Nothing is held back from it, and future premium
additions land there.

### 18.3 Pricing

**Prices are NOT set here and must never be hard-coded.** They live in
`platform_plans.price_cents`, as data.

Two facts for whoever sets them:

1. **There is no cost floor any more.** Since D-096 (schema-per-gym in one free Supabase project),
   the marginal infrastructure cost of a gym is **approximately zero**. The earlier "$10/gym/month
   floor" no longer applies. Pricing is a pure market decision.
2. **International rates are $75–200/month (≈R1,400–3,800).** South African independent gyms — the
   stated target market — are materially more price-sensitive than that. Pricing at international
   rates would be a strategic error; pricing is a market test, not a calculation.

### 18.5 Gap analysis — what this market sells that we have NOT built

Measured against the feature inventory in `vault/02` and the market research in §18.1. The market's
own "five core features" are member management, scheduling and booking, a member app, reporting, and
marketing automation.

**Where Yoyo GYM is already strong, and competitors charge extra:**

| Capability | Note |
|---|---|
| **Face recognition / biometric door** | Sold as "access control" add-on elsewhere. This is the differentiator |
| Digital waivers with signature | Indemnity + contract + signature, built in |
| PAR-Q health screening | Built in. Rare in this market |
| Per-gym branding | Name, logo, colour at runtime |
| Member 360 profile | Bookings, incidents, activity, receipts in one place |
| POPIA compliance posture | Consent, cascade erasure, deletion requests |

**Gaps — market-standard, NOT built:**

| # | Missing | Market position | Assessment |
|---|---|---|---|
| G-1 | **Automated recurring billing** | Treated as *standard* — "automated recurring billing, failed payment retry, clear financial reporting should be standard" | ⚠️ **Deliberately removed** (D-015/D-018). Members pay their gym directly. This is a conscious divergence from the market, not an oversight — but gyms **will** ask for it |
| G-2 | **Lead management / CRM / prospects** | Standard; a headline feature at Gymdesk and OfferingTree | **Not built.** No concept of a prospect who has not joined yet. The clearest genuine gap |
| G-3 | **Member app** | Standard; $39–100/mo add-on elsewhere | Planned — Capacitor, Stage 8 (D-053) |
| G-4 | **Marketing automation** | One of the five core features; $20–329/mo elsewhere | Partial. Bulk email exists; no sequences, triggers or campaigns |
| G-5 | **POS / retail** | "Sell apparel and supplements without a separate POS" | **Not built.** `addon_services` is adjacent but is not retail |
| G-6 | **Member SMS** | Common | **Not built.** Owner gets WhatsApp/Telegram; members get email only |
| G-7 | **Website builder** | Included by Gymdesk, $99/mo at Zen Planner | **Not built.** Only a public profile page per gym |
| G-8 | **Workout programming** | $79+/mo elsewhere (PushPress Train) | Partial. Trainers log workout *notes*; no programmed workouts |
| G-9 | **Multi-location** | Standard at higher tiers | **Not built.** One location per plan, by design for now |
| G-10 | **Staff payroll / commission** | Common | **Not built** |

**How to read this list.** It is a menu, not a backlog. Most gyms will never ask for most of it. The
two worth watching are **G-1** (because the market assumes it and we removed it on purpose) and
**G-2** (because converting prospects is how a gym grows, and we have no concept of a prospect at
all).

**Rule: nothing here is built speculatively.** These are recorded so that when a gym owner asks for
one, we already know where it sits in the market and what it is worth. That is what the "anything
else you need?" question at §18.6 is for.

### 18.6 Asking the owner what else they need

Gym-owner registration asks, in plain words, **what else the gym needs that the system does not do**.
Free text, optional, stored on the application and surfaced in the platform panel.

It is not a feature request form. It is **demand evidence**: three gyms asking for the same thing is
worth more than any amount of speculation about what to build next, and it costs one text box.

Answers are read against §18.5 — if a request matches a known gap, that gap gains a real customer
attached to it.
