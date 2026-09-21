---
aliases: ["Store Compliance", "App Store Compliance"]
tags: [mobile, compliance, stores, future]
stage: "Stage 2"
status: checklist-only
updated: 2026-09-21
---

# 15 — Store Compliance

Checklist for Google Play and the Apple App Store. **[M]** — no store submission exists.

> **Standing rule (`CLAUDE.md` §19):** store requirements change. **Verify every item below from
> official store documentation at Stage 10.** Never from this note, and never from model memory.
> Treat everything here as a checklist of *topics*, not as current rules.

## Checklist

**Technical** — current Android target API level · current iOS SDK level · crash monitoring ·
real-device testing · QR and deep-link testing on both platforms.

**Privacy disclosure** — privacy policy (hosted, reachable) · Google Play Data safety form ·
Apple privacy "nutrition label" · explicit consent for **health, biometric, face, camera, document
and location** data.

> This app is unusually exposed here: it collects **health data** (PAR-Q responses, injuries,
> medical aid), **biometric data** (face templates) and **identity documents** (SA ID / passport).
> All three are sensitive categories under both stores' policies and under POPIA. Disclosure will
> be substantial, and **Q-16 (biometric retention) should be answered before submission, not
> during review.**

**Account and data rights** — account deletion **in-app and via a web route**.
`server/handlers/member/request-deletion.js` exists **[C]** but only *flags* the record; erasure is
manual **[P]**. Stores generally expect actual deletion, not a request queue — likely a real gap.

**Security** — secure authentication · secure session storage (not `localStorage`) · server-side
authorization · **tenant isolation** · rate limiting · secure password recovery.

> Note: members have **no password**, so "secure password recovery" does not apply as written —
> but the absence of *any* self-service recovery for a lost phone number may itself be questioned.
> → [[13 - Authentication and Roles]]

**Sign-in** — if Google Sign-In (or any third-party social login) is added to the iPhone app,
evaluate Apple's **Sign in with Apple** requirement (Q-15).

**Payments** — **do not assume an external payment page is permitted for digital subscriptions.**
Both stores have rules here and they have changed repeatedly. This directly gates Q-08 (in-app vs
web purchase) and may materially change the economics of [[11 - Subscription Decisions]]. **Verify
first, design second.**

**Listing** — reviewer test accounts or written review instructions (a reviewer must be able to
reach a gym, register and log in) · screenshots · metadata · release notes.

## Reviewer-access problem

A reviewer needs a working gym to test against. Under Model A that means a real provisioned tenant;
under Model B a seeded demo gym. Either way a **permanent demo gym with stable credentials** is
likely required — a Stage 10 deliverable that depends on Q-01.

## Assets gap

The existing PWA ships **one SVG icon** (`public/icon.svg`) **[C]**. Stores require PNG icon sets
at multiple sizes, plus splash and feature graphics. **[M]**

## Related

[[00 - Project Purpose]] · [[10 - Mobile App]] · [[14 - Security and Privacy]] ·
[[11 - Subscription Decisions]] · [[01 - Existing Yoyo Gym Audit]] · [[17 - Open Questions]] ·
[[18 - Decision Log]]
