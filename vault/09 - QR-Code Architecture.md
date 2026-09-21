---
aliases: ["QR Code Architecture", "QR-Code Architecture"]
tags: [qr, architecture, existing-system, future]
stage: "Stage 2"
status: mixed
updated: 2026-09-21
---

# 09 — QR-Code Architecture

## Existing — confirmed

**Two independent QR generators exist** (resolves Q-28):

| Generator | Where | URL source | Output |
|---|---|---|---|
| Runtime | `src/pages/admin/QrCodes.jsx` | `window.location.origin` | On-screen + printable, per deployment |
| Build script | `scripts/generate-qr.js` | **hardcoded** `https://yoyogym.vercel.app/` | The 6 files in `qr/` (5 PNG + 1 branded PDF) |

**[C]** The `qr/` assets are **not stale leftovers** — they are deliberate printable artefacts.
But their URL is hardcoded to one gym's domain, so the script is single-gym by construction and
will need rework for the platform. Recorded as **[P]**.

### The four gym-level types

| Type | URL | Purpose |
|---|---|---|
| A — Company | `/?src=qr` | Register or log in |
| New member | `/register?src=qr` | Join |
| Existing member | `/member?src=qr` | Check in / book |
| C — Admin | `/admin/login` | Staff gate |

### Type B — per-person QR

`/p/:type/:key` → `PublicProfile.jsx`, served by
`GET /api/public-profile?type=member&key=<membership_number>` or `?type=trainer&id=<uuid>`. **[C]**

Members find theirs in the portal; staff find member/trainer QRs on each record.

### Scanning and analytics

`jsqr` scans in-browser (`src/lib/scan.js`). `POST /api/scan` logs `{qr_type, user_agent, ip}` to
`qr_scan_analytics` and **never blocks the page on failure** **[C]**. Stats at `/admin/qr-codes`.

### The defining constraint

**No QR contains a gym identifier.** Gym identity is implicit in the domain the QR points at. **[C]**

## DECIDED 2026-09-21 (D-036) — the routing model

**No per-gym subdomains.** Each gym has a **name** and **its own QR code**. Entry is through the
**Yoyo mobile app**:

```text
Member opens the Yoyo app
   ├── scans the gym's QR code        → app resolves the gym directly
   └── or searches the gym by name    → results come from the platform registry,
                                         populated when the gym was approved
        ▼
   Gym context established in the app
        ▼
   The EXISTING member registration / login flow for that gym
```

**Consequences for QR design:**

- The gym QR must carry a **gym identifier**, which today's codes do not (they carry only a URL on
  one deployment's origin).
- It must deep-link into the app when installed, and fall back to web / the store when not — so
  **Android App Links and Apple Universal Links are now required**, not optional.
- `scripts/generate-qr.js` hardcodes `https://yoyogym.vercel.app/` and must be reworked to emit
  per-gym codes from the registry.
- The gym identifier in the payload is **public** and that is acceptable (D-035) — but it must never
  be accompanied by a verification code or any reusable secret.

## Required — future platform

A gym QR must identify the gym, then route to: the app if installed → a web landing page if not →
the correct app store → the correct gym context after install → the existing registration or login
flow for that gym. **[R] [M]**

A member-ID QR must carry gym/member context but **must not auto-authenticate**. **[R]**

### Prohibited in any QR payload

Passwords · private biometric data · health information · reusable authentication secrets ·
sensitive personal data. (`CLAUDE.md` §14)

> Note the tension with the existing system: the **verification code is effectively a reusable
> secret** — `POST /api/document` accepts `membership_number` + `verification_code` with no
> session (Q-19). A future member-ID QR must not embed that pair, or it becomes a document-access
> token that anyone can photograph. **Flagged, not solved.**

### To evaluate at the mobile stage

Android **App Links** and Apple **Universal Links** — both require server-hosted association files
(`assetlinks.json`, `apple-app-site-association`) at a domain the app trusts. **How that works
across up to 10,000 gym domains is entirely open** and is a direct function of Q-02.

## Physical-world constraint

Printed QR codes already exist in the real world. Changing an existing URL **orphans printed
material**. Any new scheme should be additive — new codes alongside old ones — unless the user
accepts reprinting. → [[03 - Protected Existing Functions]]

## Open

Q-02 (platform boundary drives URL shape) · Q-13 (framework drives deep-link mechanics) ·
Q-19 (verification-code exposure) · Q-28 **resolved above**.

## Related

[[00 - Project Purpose]] · [[01 - Existing Yoyo Gym Audit]] · [[08 - Member Workflows]] ·
[[10 - Mobile App]] · [[06 - Tenant Architecture]] · [[14 - Security and Privacy]] ·
[[17 - Open Questions]] · [[18 - Decision Log]]
