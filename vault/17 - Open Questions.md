---
aliases: ["Open Questions", "Unknowns"]
tags: [questions, unknowns]
stage: "Stage 2"
status: active
updated: 2026-09-21
---

# 17 — Open Questions

Everything not yet decided. Nothing here may be invented or assumed (`CLAUDE.md` §30).
When one is answered, move it to [[18 - Decision Log]] with its rationale.

## Blocking — Stage 1 cannot close without these

| # | Question | Why it blocks | Evidence |
|---|---|---|---|
| Q-01 | **Tenancy model**: separate Supabase project per gym (A), shared DB with `gym_id` + RLS (B), or hybrid/sharded (C)? | Gates every stage below it. A leaves the existing code nearly untouched but means ~10,000 projects to provision, migrate and monitor; B scales operationally but touches all 24 tables, every handler and both auth paths — the surface `CLAUDE.md` §32 protects | [[01 - Existing Yoyo Gym Audit]] §2 |
| Q-02 | **Platform boundary**: how does the platform reach a gym — subdomain, path, routing table, per-gym deployment URL, API gateway, deep link, or a mix? | Determines QR design, mobile routing and session scoping | [[06 - Tenant Architecture]] |
| Q-03 | **Member identity**: one Yoyo identity across gyms, or one per gym? Can a person belong to several gyms? | `membership_number` is unique only *within* one gym database; phone numbers are unique in neither | Audit §3, §5 |

## Commercial — needed before Stage 7

- **Q-04** Subscription tiers, prices, currency, billing cadence. (Provisional only: Basic ~40 /
  Medium ~150 / Prime ~500 active members, one location each — **not a decision**.)
- **Q-05** Does the platform take a share of member payments, or charge gyms a subscription only?
  This changes the Paystack design (split payments / subaccounts) and the regulatory position.
- **Q-06** Trial period; is a payment method required during the trial?
- **Q-07** What happens on non-payment — suspend the gym, degrade features, or read-only?
- **Q-08** Are subscriptions bought in the mobile app or on the web? → collides with Q-14.

## Owner onboarding — needed before Stage 6

- **Q-09** Which documents must a gym owner submit, and who reviews them?
- **Q-10** Approval rules, review SLA, rejection and appeal process.
- **Q-11** Is the owner identity created before or after subscription activation?
- **Q-12** Document retention period and storage location — note the system has **no object
  storage today** (Audit §3).

## Mobile and stores — needed before Stage 8–10

- **Q-13** Framework: extend the existing PWA, React Native/Expo, or Flutter? The app is already an
  installable PWA (Audit §16), so this is a real fork in the road, not a blank sheet.
- **Q-14** App-store billing: Google Play and Apple rules on digital subscriptions may prohibit an
  external payment page. **Verify from official docs at Stage 10 — never from memory.**
- **Q-15** Does adding Google Sign-In to the iPhone app trigger Apple's Sign in with Apple
  requirement?

## Security, privacy, legal

- **Q-16** Biometric retention policy. Face templates already exist as `jsonb` in `members`
  (128-D face-api, and empty 512-D ArcFace columns) — any policy must cover data already held.
- **Q-17** Do we activate the dormant ArcFace service, keep the in-browser engine, or drop
  ArcFace? Currently deferred by the user; `face-service/` is complete but unused.
- **Q-18** Jurisdictions beyond South Africa. The system is POPIA/CPA/ZAR/SA-ID shaped.
- **Q-19** `/api/document` authorises on `membership_number` + `verification_code` with no session.
  Acceptable per gym; **must be re-reviewed before any cross-gym exposure** (Audit §10).
- **Q-20** RLS policies must exist before any Supabase client reaches a mobile app — today the
  default-deny posture is safe only because the browser never talks to Supabase directly.

## Operational

- **Q-21** Who provisions 10,000 gyms, and at what cost? (Depends on Q-01.)
- **Q-22** Does platform code live in this repository, a sibling repository, or a monorepo?
- **Q-23** Are vault notes committed to git? `.obsidian/` and `.smart-env/` are currently
  **untracked** — so project knowledge is local-only until this is answered.
- **Q-24** Object storage strategy for photos, documents and biometric templates.

## ⚠️ Blocking implementation — opened 2026-09-21

- **Q-34 — the activation gap.** If member payments are removed (D-015), **what activates a new
  member?** Verified: `activatePayment()` is called only from the two Paystack handlers, and
  recording a manual cash/EFT payment does **not** activate anyone. A newly registered member would
  be stranded at `status:'new'`. Options (none chosen): make manual payment capture activate;
  add an explicit "Activate member" action; or auto-activate on registration and let gyms suspend
  non-payers. **No payment code may be removed until this is answered.**
  → [[03 - Protected Existing Functions]]
- **Q-35 — scope of the payment removal.** Remove the Paystack/online path only, or also the
  `payments` table, manual capture, AR aging, dunning and receipts? Recommendation: **remove online
  payment, keep payment tracking** — the membership lifecycle depends on it. Needs confirmation.
- **Q-36 — per-gym secrets store.** Under any shared-application model, per-gym Supabase URLs,
  service keys and `JWT_SECRET`s cannot live in Vercel env vars (64 KB total per deployment **[V]**).
  Where do they live, and how are they rotated?
- **Q-37 — connection management.** Thousands of Supabase clients from one serverless application
  needs a pooling and eviction strategy. Unsolved.

## ✅ Answered 2026-09-21 — moved to the decision log

| # | Question | Answer |
|---|---|---|
| Q-32 | Is ~10,000 a real plan? | **Real — thousands within 24 months** (D-012). Manual provisioning is therefore dead; automation is mandatory |
| Q-33 | Keep the gym-owned posture? | **Platform bills gyms only and never touches member money**; each gym's data stays in **its own database** (D-013, D-014) |
| Q-05 | Revenue model | **Flat subscription from gyms only** (D-013). No share of member payments |
| — | Member payments | **Removed from the product** (D-015) — blocked on Q-34/Q-35 |
| Q-23 | Commit vault to git? | **Yes** (D-009) |

**Q-01 is now narrowed**: Model B is ruled out by D-014. See [[06 - Tenant Architecture]] §6b for
the recommendation awaiting approval.

## Unknown costs and limits — opened 2026-09-21 (Stage 1)

Vendor limits that must be confirmed, never guessed. Full context in [[06 - Tenant Architecture]] §6.

- **U-1** Maximum Supabase projects per organization on paid plans — undocumented.
- **U-2** Real per-project monthly floor (plan + dedicated compute) at Basic/Medium/Prime gym sizes.
- **U-3** Vercel Enterprise ceiling for projects-per-Git-repository (Pro is **150**; Enterprise is "Custom").
- **U-4** Whether Supabase/Vercel offer partner or reseller terms at this volume.
- **U-5** Cost and reliability of automated provisioning via both management APIs.
- **U-6** Real ongoing support hours per gym per month (the runbook covers setup only).
- **U-7** Whether gyms will accept MuleSoo-owned infrastructure, given the current gym-owned pitch.
- **U-8** Migration cost of moving *existing live* gyms into whichever model is chosen.

## Business questions raised by the Stage 1 comparison

- **Q-32** **Is ~10,000 gyms a real 24-month plan or an aspiration?** The documented model is a
  hands-on agency practice with a 1–2 hour manual onboarding per gym. The right architecture for
  100 gyms differs materially from the right one for 10,000. This should be answered *before* Q-01.
- **Q-33** Is the **gym-owned** posture retained — gym's own Paystack, gym's own Supabase, gym as
  POPIA responsible party and MuleSoo as processor (`scripts/business-guide.js:157-162`)? Model B
  reverses it. Changing it is legitimate but must be **deliberate**, not a side-effect of a database
  choice.

## Platform panel — new, opened 2026-09-21

- **Q-30** Where does the platform admin panel live — same deployment, separate deployment, or
  separate repository? (Related to Q-22.) → [[05 - Main Platform Admin Panel]]
- **Q-31** Does the platform owner ever need to *enter* a gym's admin panel (impersonation or
  support access)? If yes it needs its own security and audit design, and it is in direct tension
  with "Gym 1 must not see Gym 2 data."

## ✅ Resolved 2026-09-21 — answered from repository evidence

| # | Question | Answer |
|---|---|---|
| Q-25 | Is `IdPhotoStep.jsx` dead code? | **No — live.** Imported and rendered by `src/chatbot/components/Controls.jsx:10,32` for control type `'face'`. Every membership card must carry a photo, so a member who declines the biometric uploads one instead |
| Q-26 | What authoritatively activates a member? | **`activatePayment()`** in `server/lib/activation.js` — idempotent, called by exactly two callers (`payments/verify.js`, `payments/webhook.js`); sets payment→received, membership→active, member→active. Plus a manual admin override: `PATCH /api/admin/member?id=` with `{status}`, audited. `member-action.js` does **not** activate |
| Q-27 | Are `settings` keys documented? | **No.** Free-form key/value store (`{key unique, value jsonb, category}`), upsert on conflict, **no key validation and no enumerated list**. Confirmed keys in use: `gym_profile`, `contract_discounts`, `compliance`. → [[12 - Database Architecture]] |
| Q-28 | Are the `qr/` assets current? | **Yes — deliberate printable artefacts.** Generated by `scripts/generate-qr.js`, separate from the runtime generator in `QrCodes.jsx`, and using a **hardcoded** `https://yoyogym.vercel.app/`. Single-gym by construction → needs rework for the platform. → [[09 - QR-Code Architecture]] |
| Q-29 | Are staff on the door face scanner? | **No.** `access-card.js` branches on `member` / `trainer` only; `resolve-member.js` queries `members` then `trainers`. `admin_users` is never matched. Adding staff is a *feature request*, not a defect |

> **Lesson** ([[20 - Change History]]): Q-25 and Q-28 were flagged as possible dead code because no
> obvious reference was found. Both were live. **Absence of an obvious call site is not evidence of
> dead code** — trace imports first.

## Related

[[00 - Project Purpose]] · [[01 - Existing Yoyo Gym Audit]] · [[18 - Decision Log]] ·
[[06 - Tenant Architecture]] · [[11 - Subscription Decisions]] · [[10 - Mobile App]]
