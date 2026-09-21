---
aliases: ["Project Purpose", "Yoyo Gyms Purpose"]
tags: [purpose, root]
stage: "Stage 2"
status: approved
updated: 2026-09-21
---

# 00 — Project Purpose

The root note of this vault. Everything else hangs off it.

## What Yoyo Gyms is

**Yoyo Gyms** is a platform layer that connects and manages many independent gyms — the target is
approximately **10,000**, each fully separated from every other.

Each gym keeps its own owner, members, data, settings, admin panel, and the whole of the existing
single-gym functionality documented in [[01 - Existing Yoyo Gym Audit]].

The platform adds only what a single gym cannot do for itself:

- A main platform-owner admin panel → [[05 - Main Platform Admin Panel]]
- Gym-owner registration, document review, approval or rejection → [[07 - Owner Workflows]]
- Gym-tenant creation and owner activation → [[06 - Tenant Architecture]]
- Subscription management → [[11 - Subscription Decisions]]
- Platform activity and financial monitoring
- Security and audit controls → [[14 - Security and Privacy]]
- One shared Android and iPhone application → [[10 - Mobile App]]
- Gym search, gym-specific QR routing → [[09 - QR-Code Architecture]]
- Connection of every approved gym to its own existing Yoyo Gym system

## The foundation rule

The existing single-gym **Yoyo Gym** system is the foundation, not a prototype. Yoyo Gyms is built
**around** it, never by replacing or redesigning it. The protected surface is listed in
[[03 - Protected Existing Functions]] and enforced by `CLAUDE.md` §32.

## The boundary

| | Existing Yoyo Gym | Future Yoyo Gyms |
|---|---|---|
| Scope | One gym | All gyms |
| Admin | `/admin/*`, 23 guarded routes | New platform-owner panel |
| Identity | Admin: username + password · Member: membership number + phone | Gym resolution *before* the existing login runs |
| Data | `gym` schema, 24 tables, no gym identifier | Gym registry, applications, documents, subscriptions |
| Money | Paystack per gym, member fees | Subscription billing from gyms to the platform |
| QR | URLs from `window.location.origin` | Gym-specific routing |

## How this project works

- **Authoritative instructions** live in the repository at `CLAUDE.md` (v2, approved 2026-09-21).
- **This vault plus Graphify is the memory of record.** Chat history is not.
- Work proceeds **one stage at a time**; a stage ends only when its gate is approved
  (`CLAUDE.md` §34–35, mirrored in [[19 - Implementation Phases]]).
- On any failure: read the real error, search this vault, check [[18 - Decision Log]], read the
  code — **then** form a view. Never guess a cause (`CLAUDE.md` §27.1).

## Current position

Stage 2 is open for documentation only. The **tenancy decision (Stage 1) has not been made** and
must not be pre-empted — see [[17 - Open Questions]].
