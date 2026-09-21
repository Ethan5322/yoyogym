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

## The Telga precedent — inspected 2026-09-21 (read-only)

`Desktop/Telga` is MuleSoo's other product (merchant airtime vending, Ethiopia). The user asked for
Yoyo Gyms to work the same way. **Nothing in Telga was modified.**

### How Telga actually ships a store app

**Capacitor.** `apps/mobile` is a thin shell wrapping the server's own screens:

> *"This project does not reimplement them, and it must not: a second implementation of a vending
> flow is a second place for a duplicate sale to come from. What it does is package the existing app
> as an installable Android application so it can be listed on Google Play, and give it the one
> thing a browser tab does not have — a launcher icon, its own task in the app switcher, and an
> update channel."* — `apps/mobile/capacitor.config.ts`

Dependencies are only `@capacitor/core` + `@capacitor/android`. The web app is untouched, and its
PWA install route still works alongside the store app.

### Stated honestly: Telga is Android-only today

`apps/mobile/ios` **does not exist**. Every script is `cap sync android` / `gradlew.bat`. Capacitor
*supports* iOS, but **Telga has not proven it**. Treating iOS as demonstrated because Telga exists
would be wrong.

### Patterns worth copying

| Telga pattern | Why it matters here |
|---|---|
| **Shell wraps the server's screens; never reimplements a flow** | The strongest argument yet for not rebuilding 23 admin routes and a 38-step chatbot natively |
| **`shell.config.json` is the single source of truth for allowed hosts** | Capacitor's `allowNavigation` and the connect screen read one file, so they cannot drift |
| **The merchant app deliberately CANNOT open the staff console** (`admin.telga.pro` excluded — *"different users, different auth, different threat model"*) | Maps exactly onto D-044: the member app must never reach the platform admin panel |
| **`npm run docs:validate`** — checks the vault for broken links, orphans and frontmatter | Our vault has no such check; link rot is already a risk at 22 notes |
| **Numbered vault folders + Graphify + a Decision Log with stable IDs** | The same second-brain shape, further along |
| **866 tests, typecheck, launch gates** | Yoyo GYM has 49 |

### What this implies for Yoyo Gyms — RECOMMENDATION, not a decision

**Capacitor is very likely the right answer here, and cheaper than React Native or Flutter**, because
the existing system is *already* a React web app and *already* an installable PWA:

- **Face recognition keeps working.** `@vladmandic/face-api` runs in the webview, which is on the
  device — so **D-042's "1:1 on-device" is satisfied with no native ML rebuild**. `jsqr` likewise.
- No reimplementation of the admin panel, the chatbot, or the member portal.
- One codebase, both stores, consistent with D-038.

**The honest caveats:** a webview app must still satisfy store reviewers that it is more than a
website; camera permissions and deep links need Capacitor plugins and real-device testing; and
**iOS is unproven in Telga**, so it is new ground either way.

**Q-13 is therefore narrowed but NOT closed** — Capacitor vs React Native needs the user's word.

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
