---
aliases: ["Owner Workflows", "Owner Registration Flow", "Gym Owner Onboarding"]
tags: [platform, owner, workflow, future]
stage: "Stage 2"
status: requirements-only
updated: 2026-09-21
---

# 07 — Owner Workflows

How a gym owner joins the platform. **Conceptual only — the brief calls this "not yet fully
finalized" and nothing here is decided.** Does not exist in the repository **[M]**.

## The expected sequence (from the brief, unratified)

```text
Gym owner applies
→ Yoyo platform reviews the application
→ Approved or rejected
→ Gym tenant created
→ Owner receives a verification link and code
→ Owner activates the account
→ Subscription decision
→ Owner receives final access
→ Owner opens their assigned existing gym admin panel
```

The final step is the join to [[01 - Existing Yoyo Gym Audit]] — the owner lands in the existing
`/admin` panel as an `owner`-role user in *their* gym.

## What already exists and can be reused

The single-gym system already solves parts of this at gym scale **[C]**:

| Need | Existing mechanism | File |
|---|---|---|
| Create an owner account with a role | Staff creation, owner-only | `server/handlers/admin/staff.js` |
| Issue a staff number + verification code | Lazy issuance on first need | `server/handlers/admin/profile.js`, `server/lib/identifiers.js` (`STF-YYYY-XXXXXX`, 8-char code) |
| Verification-code activation pattern | Member + staff codes already work this way | `server/lib/identifiers.js` |
| Credential PDF for a new staff member | Branded credential + contract | `src/lib/credentialPdf.js`, `staffContractPdf.js` |
| Email delivery | Brevo, with send logging | `server/lib/notify/channels.js` |
| Audit of who approved what | `audit_log` + `recordAudit()` | `server/lib/audit.js` |

**These are precedents, not a design.** Reusing them is a proposal for Stage 6, not a decision.

## Open, must not be invented

| # | Question |
|---|---|
| Q-09 | Which documents must an owner submit? (business registration, ID, proof of premises, tax, insurance — **unknown**) |
| Q-10 | Approval rules, review SLA, rejection and appeal process |
| Q-11 | Is the owner identity created **before or after** subscription activation? |
| Q-12 | Document retention period and storage — **note there is no object storage today** (Q-24) |
| Q-06 | Trial period; is a payment method required during it? |
| Q-08 | Are subscriptions bought in-app or on the web? → collides with Q-14 (store billing rules) |

## Hard dependency

Step 4, "gym tenant created", **cannot be specified before Q-01**. Under Model A it provisions a
Supabase project, a Vercel deployment and a full env-var set; under Model B it inserts a row. The
owner-facing workflow looks identical either way; the machinery behind it does not.

## Security notes carried forward

- Document upload introduces **file storage**, which the system does not have today — new attack
  surface, new retention duty. → [[14 - Security and Privacy]]
- Owner identity must live in a **separate role namespace** from gym roles, so a gym `owner` can
  never satisfy a platform check. → [[13 - Authentication and Roles]]
- Approval, rejection and suspension are **financially consequential** actions and must be audited.

## Related

[[00 - Project Purpose]] · [[01 - Existing Yoyo Gym Audit]] · [[04 - Yoyo Gyms Platform]] ·
[[05 - Main Platform Admin Panel]] · [[06 - Tenant Architecture]] · [[11 - Subscription Decisions]] ·
[[17 - Open Questions]] · [[18 - Decision Log]]
