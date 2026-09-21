---
aliases: ["Main Platform Admin Panel", "Platform Admin"]
tags: [platform, admin, requirements, future]
stage: "Stage 2"
status: requirements-only
updated: 2026-09-21
---

# 05 — Main Platform Admin Panel

The Yoyo platform owner's panel. **Requirements only.** Does not exist in the repository **[M]**.

It is a **separate application surface** from the 23 gym-admin routes in
[[01 - Existing Yoyo Gym Audit]] §8. Permissions must not be mixed (`CLAUDE.md` §16).

## Required functions

**Applications** — list gym-owner applications; review submitted documents; approve; reject;
request more information.

**Tenancy** — create a gym tenant; activate a gym; suspend; reactivate. *(Mechanism depends
entirely on Q-01 — under Model A this provisions infrastructure, under Model B it inserts a row.)*

**Owners and gyms** — manage gym owners; search gyms; search owners; view per-gym aggregate
statistics.

**Commercial** — manage subscriptions; monitor platform finances → [[11 - Subscription Decisions]].

**Governance** — security alerts; platform audit log; platform settings.

## Design constraints from the existing system

These are lessons the gym panel already encodes; the platform panel should not re-learn them.

| Constraint | Source | Why it matters here |
|---|---|---|
| Role enforcement is **server-side in every handler** | `requireRole()` in 37 handlers | A platform panel guarded only in React would be guarded by nothing |
| Platform roles must be a **separate namespace** from `owner/manager/reception/trainer` | `server/lib/auth.js` | A gym `owner` must never satisfy a platform-owner check |
| Token separation by JWT `audience` already exists | `memberauth.js` uses `audience: 'member'` | The same mechanism extends naturally to a platform audience **[?]** — a proposal, not a decision |
| Every mutating action is audited | `server/lib/audit.js` → `audit_log` | Platform actions (approve, suspend, refund) need at least the same |
| Vercel counts Serverless Functions | logic lives outside `api/` | A platform panel must not blow the function budget — same router pattern |

## Open questions specific to this panel

- **Q-30** Where does the platform panel live — same deployment, separate deployment, separate
  repository? (Related to Q-22.) → recorded in [[17 - Open Questions]]
- **Q-31** Does the platform owner ever need to *enter* a gym's admin panel (impersonation /
  support access)? If yes, that is a significant security and audit design in its own right, and a
  direct tension with "Gym 1 must not see Gym 2 data".

Both are **[?]** and must not be assumed.

## Gate

Stage 5 closes only when **Gym 1 cannot see Gym 2 data, proven by an automated test**
(`CLAUDE.md` §34).

## Related

[[00 - Project Purpose]] · [[01 - Existing Yoyo Gym Audit]] · [[04 - Yoyo Gyms Platform]] ·
[[06 - Tenant Architecture]] · [[13 - Authentication and Roles]] · [[14 - Security and Privacy]] ·
[[17 - Open Questions]] · [[18 - Decision Log]]
