---
aliases: ["Implementation Phases", "Stages", "Build Stages"]
tags: [process, stages, planning]
stage: "Stage 2"
status: active
updated: 2026-09-21
---

# 19 — Implementation Phases

Mirrors `CLAUDE.md` §34–35, which is authoritative. This note adds the vault links.

## The binding rule

**One stage is open at a time.** A stage is finished when its exit criteria are met **and the user
confirms the gate** — not when the code is written. No working ahead, no bundling stages. If a
stage is blocked, finish everything unblocked in it and report the blocker.

## Stage table

| Stage | Name | Gate | Notes |
|---|---|---|---|
| 0 | Discovery and documentation | ✅ **CLOSED** 2026-09-21 | `CLAUDE.md` v2 approved; prior audit declared permanently absent |
| 2 | Obsidian vault foundation | 🟡 **OPEN** | [[01 - Existing Yoyo Gym Audit]] approved; notes 00–20 created; Q-23 (git tracking) still open |
| 1 | **Tenancy decision** | ⛔ **DEFERRED by user** | → [[06 - Tenant Architecture]]. **Gates Stages 3–10** |
| 3 | Platform data model | Blocked by 1 | → [[12 - Database Architecture]]. Platform-side only; the 24 tables stay untouched |
| 4 | Platform boundary & gym resolution | Blocked by 1 | `User → Role → Gym → System → Data` |
| 5 | Main platform admin panel | Blocked by 4 | → [[05 - Main Platform Admin Panel]]. **Gate: Gym 1 cannot see Gym 2 data, proven by test** |
| 6 | Owner onboarding & provisioning | Blocked by 5 | → [[07 - Owner Workflows]]. Also re-review `/api/document` (Q-19) |
| 7 | Subscriptions | Blocked by 6 | → [[11 - Subscription Decisions]]. Tiers/prices from the user; nothing hard-coded |
| 8 | Mobile app | Blocked by 1, 2(boundary) | → [[10 - Mobile App]]. Install the §2 design skill when this opens |
| 9 | QR & deep links | Blocked by 8 | → [[09 - QR-Code Architecture]]. Verify on real devices |
| 10 | Store compliance & release | Blocked by 9 | → [[15 - Store Compliance]]. Re-verify store rules from official docs |

> **Stage order note.** Stage 2 was deliberately brought forward ahead of Stage 1 by user decision
> (D-004 in [[18 - Decision Log]]), so the tenancy choice is made against written evidence rather
> than recollection. Stage 1 still gates Stages 3–10.

## Current status

```text
CLOSED:    Stage 0 — discovery and documentation
           Stage 1 — TENANCY DECIDED (D-016, Model C: shared app + per-gym database)
           Stage 2 — vault foundation (21 notes, committed to git)

OPEN:      Stage 3 — platform data model (DESIGN DELIVERED, awaiting gate)
           14 platform tables proposed in note 12. No migration, no SQL,
           no change to the existing 24 tables.

GATE:      Stage 3 closes when the user approves the proposed schema.
           Checklist: secrets-never-in-DB invariant accepted; deletion policy
           accepted; platform_plans as data accepted; no existing table touched.

READY:     Payment removal — fully unblocked (D-017/018/019, Q-39 confirmed).
           A protected-surface change needing its OWN approved slot; not Stage 3.
           NB D-021: keep server/lib/paystack.js — the platform needs it (D-020).

RISKS:     U-1  max Supabase projects per org — undocumented, and D-016 + D-014 both
                rest on it. Accepted by the user. ASK SUPABASE DIRECTLY.

CARRIED:   Q-02 platform boundary · Q-03 member identity → Stage 4
           Q-36 secrets store · Q-37 connection pooling → Stage 4
           Q-38 migration orchestration → Stage 3
```

## Gate checklist (every stage)

1. Exit criteria met and demonstrated, not asserted
2. Tests run, results reported honestly — failures stated with output
3. [[03 - Protected Existing Functions]] confirmed not violated
4. Decisions recorded in [[18 - Decision Log]]
5. New unknowns added to [[17 - Open Questions]]
6. Affected notes updated; [[20 - Change History]] appended
7. **Stop and ask.** The user confirms the gate

## Related

[[00 - Project Purpose]] · [[01 - Existing Yoyo Gym Audit]] · [[04 - Yoyo Gyms Platform]] ·
[[06 - Tenant Architecture]] · [[17 - Open Questions]] · [[18 - Decision Log]] ·
[[20 - Change History]]
