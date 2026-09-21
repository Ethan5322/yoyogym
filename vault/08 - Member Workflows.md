---
aliases: ["Member Workflows", "Member Entry Flow"]
tags: [member, workflow, existing-system, future]
stage: "Stage 2"
status: mixed
updated: 2026-09-21
---

# 08 — Member Workflows

Existing member journeys **[C]** and what the platform must add around them **[R]**.

## Existing: new member registration — confirmed

```text
QR scan or link → /register?src=qr → scripted chatbot (38 steps) → POST /api/register
→ member + membership + PAR-Q + add-ons written, status 'new'
→ membership number GYM-YYYY-XXXXXX + 8-char verification code issued
→ notifications to member and owner
→ PaymentScreen → Paystack → activatePayment() → status 'active'
→ SuccessScreen → membership card PDF
```

**[C]** Step groups: identity → ID (SA ID *or* passport, branches on nationality) → contact →
address → emergency contact → **photo (face scan or gallery upload — mandatory either way, Q-25)**
→ PAR-Q ×7 + result → goals → commercial (plan, add-ons, medical aid) → summary → agreement.

Server guarantees: re-validation, **pricing recomputed from the database**, 6 req/min rate limit,
age ≥ 16, both agreements signed.

## Existing: member sign-in — confirmed

| Method | Credentials | Session |
|---|---|---|
| Standard | `membership_number` + `phone` | 12h JWT, `audience: 'member'` |
| Face | `{ image }` (ArcFace) or `{ descriptor }` (face-api) | same |

**No password. No email login.** **[C]**

## Existing: in-gym and portal journeys — confirmed

Check-in (self via portal, or staff via verification code / face turnstile) · class browse, book,
cancel (tier + capacity + waitlist; <2h cancellation flagged) · progress entries · history with
trainer workout notes · two-way messaging · announcements · profile edit · pay outstanding
balance · request plan change (**request only — members never self-bill**) · refer a friend ·
face re-enrolment · data-deletion request **[P]** (flags only; erasure is manual).

## Required: what the platform adds

| # | Requirement | Status | Note |
|---|---|---|---|
| 1 | Find the right gym before anything else | **[R] [M]** | Manual search, or QR, or member-ID QR |
| 2 | Establish gym context in the app | **[R] [M]** | Depends on Q-02 |
| 3 | **Then** open the *existing* registration flow for that gym | **[R]** | The 38-step flow must be reused, not rebuilt |
| 4 | **Then** open the *existing* login for that gym | **[R]** | Number + phone must keep working |
| 5 | Member-ID QR identifies context but **must not auto-authenticate** | **[R]** | `CLAUDE.md` §14 |

The ordering matters: **gym first, then the existing flow.** The platform is a router into the
existing system, not a replacement for it.

## The identity problem (Q-03)

Confirmed constraint **[C]**: `members.membership_number` is `unique` **within one gym database**.
Phone numbers are unique in neither.

Consequences:

- Under Model A, two gyms can independently mint the same `GYM-2026-ABC123`. Number + phone is
  therefore **not a globally unique credential** — a member must say which gym first.
- Under Model B, the unique constraint would have to become `(gym_id, membership_number)`, which is
  a change to the protected schema → [[03 - Protected Existing Functions]].
- If one person may belong to several gyms, "log in" becomes "log in *to which gym*" — an
  unavoidable extra step unless a platform-level identity is introduced.

**Undecided.** Do not change member identity behaviour until Q-03 is answered.

## Sign-in methods under consideration (none decided)

Existing number + phone **[C, must survive]** · face login **[C]** · email + password **[?]** ·
phone verification **[?]** · Google Sign-In **[?]** · Apple Sign-In **[?]** · device biometrics to
unlock a stored credential **[?]**.

Constraints: do not force social login on existing members without a migration decision; adding
Google Sign-In to iOS may trigger Sign in with Apple (Q-15); prefer device biometrics over
uploading raw face data.

## Related

[[00 - Project Purpose]] · [[01 - Existing Yoyo Gym Audit]] · [[09 - QR-Code Architecture]] ·
[[10 - Mobile App]] · [[13 - Authentication and Roles]] · [[03 - Protected Existing Functions]] ·
[[17 - Open Questions]] · [[18 - Decision Log]]
