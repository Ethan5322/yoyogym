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

## ✅ The sequence — DECIDED 2026-09-21

```text
Owner applies in the Yoyo app or on the web
   │  submits FOUR documents (D-047):
   │    · business registration (CIPC)
   │    · owner's ID or passport
   │    · proof of premises
   │    · tax clearance / VAT number
   ▼
MANUAL review by the platform owner (D-048)
   │  no published SLA. Approve · reject · request more information.
   │  Every decision is appended to application_events (never edited).
   ▼
APPROVED  →  gym tenant created (D-049)
   │  Supabase project provisioned, schema loaded, secrets written to the
   │  secrets manager (D-043), gym row created with status 'provisioning'.
   ▼
Owner receives a verification link + code  →  activates the account
   │  owner_activations stores HASHES only, never the raw token or code.
   ▼
SUBSCRIPTION required before the gym goes live (D-049)
   │  Paystack (D-020). gyms.status stays 'pending' until the first payment.
   ▼
ACTIVE  →  owner opens their own existing gym admin panel
           and the gym becomes findable in app search (D-036)
```

**Why manual review matters more than it looks.** Under D-036, app search *is* how members find a
gym. An unvetted listing is not just a bad customer — it is a fake gym appearing in the product's
own discovery surface. That is the argument that settled D-048.

**Documents are stored in Supabase Storage in the platform project (D-050)** — never in a gym's
database, referenced by `application_documents.storage_ref`, served by signed URL.

## The original sequence (from the brief, now superseded above)

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

| # | Question | Status |
|---|---|---|
| Q-09 | Required documents | ✅ **all four** (D-047) |
| Q-10 | Approval process | ✅ **manual, no SLA** (D-048) |
| Q-11 | Order of tenant vs payment | ✅ **approve → create → pay** (D-049) |
| Q-24 | Where documents are stored | ✅ **Supabase Storage, platform project** (D-050) |
| **Q-12** | **How long documents are kept** | ⚠️ **STILL OPEN.** Two of the four are identity documents, so this is a POPIA obligation, not paperwork |
| Q-10b | Rejection and appeal process | open |
| Q-06 | Trial period; payment method required during it? | open |
| Q-08 | Subscriptions bought in-app or on the web? → collides with Q-14 | open |

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
