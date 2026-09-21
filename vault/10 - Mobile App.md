---
aliases: ["Mobile App", "Mobile App Requirements"]
tags: [mobile, requirements, future]
stage: "Stage 2"
status: requirements-only
updated: 2026-09-21
---

# 10 — Mobile App

One shared Android + iPhone application. **Requirements only — framework undecided (Q-13).**
No native or React Native code exists in the repository **[M]**.

## Starting point — what already exists

**[C]** The web app is **already an installable PWA**:

- `public/manifest.webmanifest` — `start_url: /member`, `display: standalone`, portrait,
  `background/theme #0A0A0A`, one SVG icon marked `any maskable`
- `public/sw.js` — **network-first**, never caches `/api/`, ignores cross-origin, so deploys are
  never served stale
- Registered in `src/main.jsx`

This is a genuine fork in the road, not a blank sheet: extending the PWA is a real option with real
trade-offs against app-store distribution.

**[P]** Gaps against store-quality: a single SVG icon (stores want PNG sets), no offline strategy
beyond last-response caching, no push, no native biometric unlock, no deep-link association files.

## Required structure

```text
Gym Owner                        Gym Member
- Register as gym owner          - Register as new member
- Login as gym owner             - Login as existing member
```

### Member side — required **[R]**

Manual gym search · gym selection · gym QR entry · member-ID QR entry · correct gym context ·
**the existing** member registration · **the existing** member login.

### Owner side — required **[R]**

Owner application · verification · activation · subscription selection · owner login · open the
owner's assigned gym system.

## Framework options (Q-13 — undecided)

| Option | For | Against |
|---|---|---|
| Extend the existing PWA | Zero new codebase; reuses all 23 admin + 6 portal screens; already installable | No store presence; iOS PWA limits (push, camera quirks, no App Store discovery) |
| React Native / Expo | Real store apps; shares JS/React skills and some logic | New codebase to maintain alongside the web app |
| Flutter | Strong native feel | Different language and toolchain from the entire existing stack |

**Not decided.** Evidence that should weigh: the camera is central (face capture, QR scanning), and
the existing face pipeline is **browser-based** (`@vladmandic/face-api` running in-page) — a native
app would need that pipeline rebuilt or wrapped. That is a significant, easily-underestimated cost.

## Hard prerequisites

Per `CLAUDE.md` §15: **do not build the mobile app until the tenancy (Q-01) and platform-boundary
(Q-02) decisions are complete.** Also:

- The §2 skill (`npx -y skills add ceorkm/mobile-app-ui-design --agent claude-code`) is installed
  **when Stage 8 opens**, not before.
- **RLS policies must exist before any Supabase client reaches a mobile app** (Q-20). Today RLS is
  enabled with zero policies and is safe only because the browser never talks to Supabase.

## Security constraints

Secure session storage · server-side authorization (never client-declared role or gym) ·
minimum permissions · **prefer device biometrics to unlock a stored credential over uploading raw
face data** · account deletion in-app *and* via a web route (`request-deletion.js` is a starting
point, but erasure is manual today **[P]**).

## Related

[[00 - Project Purpose]] · [[01 - Existing Yoyo Gym Audit]] · [[08 - Member Workflows]] ·
[[09 - QR-Code Architecture]] · [[15 - Store Compliance]] · [[14 - Security and Privacy]] ·
[[06 - Tenant Architecture]] · [[17 - Open Questions]] · [[18 - Decision Log]]
