---
aliases: ["Yoyo Gyms Platform", "Platform Overview"]
tags: [platform, requirements, future]
stage: "Stage 2"
status: requirements-only
updated: 2026-09-21
---

# 04 — Yoyo Gyms Platform

What the platform must eventually do. **Requirements only — nothing here is designed or decided.**
The architecture is blocked on Q-01 in [[17 - Open Questions]].

Markers: **[R]** required by the brief · **[?]** open · **[M]** absent from the repository today.

## Scope

A platform layer over many independent copies of the system in [[01 - Existing Yoyo Gym Audit]],
targeting ~10,000 gyms, each fully separated.

**Everything in this note is [M] — no multi-gym concept exists in the repository.** There is no
`gym_id`, no registry, no tenant routing, no platform panel. Verified 2026-09-21.

## Required capabilities

| # | Capability | Status | Detail |
|---|---|---|---|
| 1 | Platform-owner admin panel | **[R]** | → [[05 - Main Platform Admin Panel]] |
| 2 | Gym-owner registration and application | **[R]** | → [[07 - Owner Workflows]] |
| 3 | Document review | **[R]** | Which documents is **[?]** (Q-09) |
| 4 | Approve / reject / request more info | **[R]** | Rules and SLA **[?]** (Q-10) |
| 5 | Gym-tenant creation | **[R]** | Mechanism depends entirely on Q-01 |
| 6 | Gym-owner activation | **[R]** | Verification link + code |
| 7 | Subscription management | **[R]** | → [[11 - Subscription Decisions]] |
| 8 | Platform activity monitoring | **[R]** | Aggregate across gyms |
| 9 | Platform financial monitoring | **[R]** | Revenue model **[?]** (Q-05) |
| 10 | Security and audit controls | **[R]** | → [[14 - Security and Privacy]] |
| 11 | One shared Android + iPhone app | **[R]** | → [[10 - Mobile App]] |
| 12 | Gym-owner login | **[R]** | Distinct from gym-staff login |
| 13 | Gym-member login | **[R]** | Must preserve number + phone |
| 14 | Gym-member registration | **[R]** | Must reuse the existing 38-step flow |
| 15 | Gym search | **[R]** | Needs a registry — depends on Q-01 |
| 16 | Gym-specific QR routing | **[R]** | → [[09 - QR-Code Architecture]] |
| 17 | Connect each approved gym to its own system | **[R]** | → [[06 - Tenant Architecture]] |

## The hard boundary

**Gym 1 must never see Gym 2 data.** This is the single non-negotiable property, and it is the
exit criterion for Stage 5 — proven by an automated test, not by inspection.

Today isolation is absolute *by construction*: separate Supabase projects cannot see each other.
Whether that survives the Q-01 decision is exactly what Q-01 decides.

## What the platform must not do

- Not replace or redesign the single-gym system ([[03 - Protected Existing Functions]])
- Not mix platform-admin permissions with gym-admin permissions
- Not require the existing member login to change ([[08 - Member Workflows]])
- Not expose another gym's documents — note the `/api/document` two-secret pattern (Q-19)

## Sequencing

The platform cannot be designed before Q-01, Q-02 and Q-03 are answered. Stage 1 is deliberately
still closed. See [[19 - Implementation Phases]].

## Related

[[00 - Project Purpose]] · [[01 - Existing Yoyo Gym Audit]] · [[05 - Main Platform Admin Panel]] ·
[[06 - Tenant Architecture]] · [[07 - Owner Workflows]] · [[08 - Member Workflows]] ·
[[17 - Open Questions]] · [[18 - Decision Log]]
