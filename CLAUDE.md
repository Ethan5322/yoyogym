# CLAUDE.md — Yoyo Gyms Platform v2

> **How to use this file.** This is the operating contract for all Claude Code work in this
> repository. Read it before any major feature. Sections 1–33 define the project, the
> protected existing system, and the open decisions. **Section 34 defines the build stages and
> the gates between them — no stage begins until the previous stage is finished, verified and
> approved.** Section 35 records which stage is open.
>
> Supersedes: `CLAUDE (3).md` (the v1 single-gym build specification, 993 lines). That file is
> retained as historical source material and is **not** loaded as project instructions. Where the
> two disagree about the *future platform*, this file wins. Where they disagree about *existing
> single-gym behaviour*, the repository wins (see §29).
>
> Facts marked **[verified]** were read directly from this repository on 2026-09-21.
> Facts marked **[undecided]** must not be invented.

---

## 1. Project identity

Project name: Yoyo Gyms

Existing product name: Yoyo Gym

Yoyo Gyms is a platform layer that connects and manages many independent gyms.

The target is to support up to approximately 10,000 gyms while keeping every gym separated.

The existing single-gym Yoyo Gym system is the foundation of the project.

Yoyo Gyms must extend and connect to the existing system without replacing its working gym operations.

**Build discipline (binding):** work proceeds **one stage at a time** per §34. Finish, verify and
get approval for a stage before opening the next. Do not work ahead. Do not bundle stages.

## 2. First install the required mobile design skill

Before designing or building mobile-app screens, install the following Claude Code skill:

```bash
npx -y skills add ceorkm/mobile-app-ui-design --agent claude-code
```

Use this skill for:

- Mobile app screen design.
- Mobile onboarding.
- Owner registration screens.
- Member registration entry screens.
- Gym search screens.
- QR-code entry screens.
- Login screens.
- Navigation.
- Mobile UI components.
- Android and iPhone design consistency.
- Accessibility and responsive mobile layouts.

Do not install or use this skill to redesign the existing single-gym system without explicit approval.

**Timing:** this install is the entry gate for **Stage 8 (mobile app)**, not for Stage 0. Install it
when Stage 8 opens, or earlier on explicit request. Do not install it automatically.

## 3. Core purpose

Yoyo Gyms will provide:

- A main platform-owner admin panel.
- Gym-owner registration and approval.
- Gym document review.
- Gym-tenant creation.
- Gym-owner activation.
- Subscription management.
- Platform activity monitoring.
- Platform financial monitoring.
- Security and audit controls.
- One shared Android and iPhone application.
- Gym-owner registration and login.
- Gym-member registration and login.
- Gym search.
- Gym-specific QR-code routing.
- Connection of every approved gym to its own existing Yoyo Gym system.

The platform must allow each gym to operate independently while the Yoyo platform owner manages the overall platform.

## 4. Existing system boundary

The existing Yoyo Gym application is a working single-gym system.

The existing system currently contains:

- One gym database schema.
- One gym deployment configuration.
- One existing gym admin panel.
- Existing gym staff roles.
- Existing member registration.
- Existing member login.
- Existing member management.
- Existing membership management.
- Existing payment processing.
- Existing PDFs.
- Existing IDs.
- Existing QR codes.
- Existing trainers and training features.
- Existing schedules and classes.
- Existing attendance and visitor features.
- Existing analytics and communication features.
- Existing biometric or face-related features.

Do not remove, rewrite, rename, or redesign these existing features unless a later approved architecture decision explicitly requires a controlled integration change.

## 5. Confirmed current architecture

The existing repository was inspected and confirmed as follows **[verified]**:

- React 18.
- Vite.
- Tailwind CSS.
- React Router.
- Vercel serverless API routes.
- Six thin API routers under `api/*` (`[...path].js`, `auth`, `admin`, `member`, `payments`, `cron`).
- Business logic under `server/` — deliberately outside `api/` so only the six routers count as
  Serverless Functions against the Vercel plan limit.
- Supabase PostgreSQL.
- Database schema named `gym`.
- Service-role database access (`SUPABASE_SERVICE_ROLE_KEY`, bypasses RLS).
- RLS enabled on every table but with **no policies**, resulting in browser default-deny behaviour.
- JWT authentication using `jsonwebtoken`.
- Password hashing using `bcryptjs`.
- Paystack library retained for PLATFORM billing only (D-021). Member-facing online
  payment was REMOVED 2026-09-21 — members pay their gym directly and staff capture it.
- Brevo email integration.
- CallMeBot WhatsApp and Telegram owner alerts.
- Client-side PDF generation using `jsPDF`.
- QR generation using `qrcode`.
- QR scanning using `jsqr`.
- In-browser face recognition using `@vladmandic/face-api`.
- Three Vercel cron jobs (`daily` 06:00, `daily-summary` 20:00, `weekly-schedule` Mon 07:00).
- Unit tests (`npm test`, `node --test`, 5 test files) and GitHub Actions CI.
- Error capture (`server/lib/observability.js`) and rate limiting (`server/lib/ratelimit.js`,
  Upstash-ready with in-memory fallback).

Additional verified facts not previously recorded **[verified]**:

- **No object storage is in use.** Member photos are a `photo_url` text column and face templates
  are `jsonb` columns **inside Postgres**. This materially affects both mobile and 10,000-gym cost
  planning and must be revisited in Stage 3.
- `shared/` holds code used by both client and server: `pricing.js`, `countries.js`.
- `face-service/` contains an **unused** Python/FastAPI InsightFace (ArcFace) microservice. It is
  deliberately **deferred** — `FACE_SERVICE_URL` is intentionally unset and the app runs on the
  in-browser face-api engine. Do not activate it without a decision.
- The system **was** South-Africa scoped. **DECIDED 2026-09-22 (D-125): Yoyo Gyms is worldwide.**
  "Local" is a property of each GYM, not of the software — `homeCountryFor(gym.country)` decides
  which identity document is asked for, and phone codes and display currency already followed the
  country. `HOME_COUNTRY = 'ZA'` remains only as the fallback for a gym that has not said where it
  is, so the existing deployment is unchanged. **Only South Africa keeps a strict ID format check**,
  because the SA ID is the only document this codebase knows how to validate. POPIA still applies
  to South African gyms; other jurisdictions bring their own rules and are **[undecided]** per gym.

Do not assume this architecture is final for the multi-tenant platform. Treat it as the confirmed current single-gym architecture.

## 6. Existing single-gym database

The existing schema contains **24 tables** **[verified — counted in `db/schema.sql`]**:

- `admin_users`
- `trainers`
- `plans`
- `addon_services`
- `members`
- `memberships`
- `parq_responses`
- `member_addons`
- `payments`
- `checkins`
- `classes`
- `class_bookings`
- `training_sessions`
- `notifications_log`
- `admin_inbox`
- `progress_entries`
- `referrals`
- `announcements`
- `settings`
- `qr_scan_analytics`
- `events`
- `visitors`
- `incidents`
- `audit_log`

13 migrations exist in `db/migrations/`, latest `2026-07-11-international-members.sql`. Every table
created by a migration also appears in `db/schema.sql`; the schema file is the complete picture.

The existing schema currently represents one gym through one Supabase project and one deployment.

The existing schema does not currently use `gym_id` or `tenant_id`.

Do not add `gym_id`, `tenant_id`, migrations, or tenant policies until the tenancy architecture has been explicitly decided.

## 7. Existing current tenancy model

The current repository uses:

```text
One Vercel deployment
+
One Supabase project
+
One environment-variable set
=
One gym
```

The gym's identity currently comes from environment variables such as:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET`
- Paystack keys
- Brevo configuration
- Owner email
- CallMeBot keys

The current schema documentation describes the database as a repeatable schema for standing up a new gym tenant using one Supabase project per gym. **[verified — stated in the header of `db/schema.sql`]**

This creates three possible future models:

1. Separate Supabase project and deployment per gym.
2. Shared database with `gym_id` and Row Level Security.
3. Hybrid or sharded architecture.

Do not choose among these models automatically.

The tenancy model is a major architecture decision and must be evaluated before implementation. It is the **Stage 1 gate** (§34).

## 8. Existing administrator roles

The current system has these confirmed roles:

- `owner`
- `manager`
- `reception`
- `trainer`

The current administrator login uses:

- Username.
- Password.
- Bcrypt password verification.
- Generic login errors (never reveals whether a username exists).
- Five failed attempts causing a 15-minute lockout.
- Disabled-account checks.
- Eight-hour JWT sessions.
- Role information in the JWT (`sub`, `username`, `role`, `full_name`, `trainer_id`).
- Face login for administrators (`/api/auth/face-login`).

The current admin panel has **23 role-guarded routes plus an unguarded `/admin/login`**
**[verified in `src/App.jsx`]**:

- Dashboard (`/admin`).
- Verify.
- FaceScan.
- Attendance.
- Visitors.
- Incidents.
- Members.
- MemberDetail.
- Today.
- Classes.
- Trainers.
- Payments.
- Analytics.
- Calendar.
- Communications.
- ManualRegister.
- Catalog.
- QrCodes.
- Settings (owner only).
- Staff (owner only).
- AuditLog.
- Inbox.
- Clients (trainer only).

They are backed by 37 admin handlers under `server/handlers/admin/`.

Preserve these existing routes and functions unless a future approved integration requires a controlled change.

## 9. Existing member authentication

The current member login uses:

- Membership number.
- Phone number.
- A 12-hour member JWT.
- JWT audience set to `member`.

There is **no member password and no member email login** **[verified]**.

The current repository also contains member face-login functionality (`/api/member/face-login`).

Do not replace the existing member login with Google Sign-In, Apple Sign-In, email login, or password login without a separate approved decision.

Future mobile authentication must provide a compatibility layer so that the existing member login continues to work.

## 10. Existing member registration

The current registration endpoint is:

```text
POST /api/register
```

The current registration implementation **[verified in `server/handlers/public/register.js`]**:

- Receives registration data from the existing chatbot flow.
- Re-validates data on the server.
- Recomputes pricing from the database.
- Does not trust client pricing.
- Generates membership numbers in the format: `GYM-YYYY-XXXXXX`
- Generates a verification code.
- Creates member records.
- Creates membership records.
- Creates PAR-Q response records.
- Creates member-add-on records.
- Supports optional face enrolment.
- Sets the initial member status to `new` and awaiting activation.
- Sends owner/member notifications.
- Applies rate limiting of six requests per minute.

Do not redesign this registration flow.

Future Yoyo Gyms mobile routing must identify the correct gym first, then open the existing member registration flow for that gym.

## 11. Existing member documents

The existing system contains:

- Membership card or confirmation PDF.
- Member ID card.
- Payment receipts.
- Member QR functionality.
- Credential PDFs.
- Staff contracts.

Confirmed implementation files include **[verified]**:

- `src/lib/pdf/generateMembershipPdf.js`
- `src/lib/idcard.js`
- `src/lib/receiptPdf.js`
- `src/lib/credentialPdf.js`
- `src/lib/staffContractPdf.js`
- `src/lib/boardReportPdf.js`

Member document delivery currently includes a document endpoint at:

```text
POST /api/document
```

Access currently uses:

- Membership number.
- Verification code.

There is **no session requirement** on this endpoint — possession of the number and code is the
authorisation. Note: the handler's own header comment says `/api/members/document`, which is stale;
the router registers it at `/api/document`. **This is a two-secret bearer pattern and must be
re-reviewed in Stage 6 before any cross-gym exposure.**

No future platform feature may expose another gym's documents.

## 12. Existing trainer functionality

The current system contains:

- A `trainers` table.
- Trainer management in the admin panel.
- A trainer-only Clients page.
- `training_sessions`.
- Workout notes surfaced in member history.
- Trainer-related credentials and contract PDFs.

Future tenant integration must preserve trainer behavior within the correct gym.

## 13. Existing QR-code functionality

The current system has QR types for:

- Company.
- New member.
- Existing member.
- Admin.

Current QR routes are based on **[verified in `src/pages/admin/QrCodes.jsx`]**:

```text
window.location.origin
```

Existing examples include:

```text
/?src=qr
/register?src=qr
/member?src=qr
/admin/login
```

The system also has per-person QR routes:

```text
/p/:type/:key
```

QR scans are logged in:

```text
qr_scan_analytics
```

Current QR codes do not contain a gym identifier. Because the URL is derived from the deployment's
own origin, gym identity today is **implicit in the domain**.

Do not change current QR behavior until the future gym-routing architecture is approved.

## 14. Future QR-code requirement

The future Yoyo Gyms platform must eventually support gym-specific routing.

A future gym QR code must identify the correct gym and then open:

- The common Yoyo Gym mobile app, if installed.
- A web landing page if the app is not installed.
- The correct app store.
- The correct gym context after app installation.
- The existing member registration or login flow for that gym.

A future member-ID QR code must identify the correct gym/member context but must not automatically authenticate the member.

QR codes must not contain:

- Passwords.
- Private biometric data.
- Health information.
- Reusable authentication secrets.
- Sensitive personal data.

Android App Links and Apple Universal Links must be evaluated during the mobile architecture phase.

## 15. Future mobile application

The future product will use one shared mobile app for Android and iPhone.

The app will have two major areas:

```text
Gym Owner
- Register as gym owner
- Login as gym owner

Gym Member
- Register as new member
- Login as existing member
```

The member side must support:

- Manual gym search.
- Gym selection.
- Gym QR-code entry.
- Member-ID QR-code entry.
- Correct gym context.
- Existing member registration.
- Existing member login.

The owner side must eventually support:

- Owner application.
- Owner verification.
- Owner activation.
- Subscription selection.
- Owner login.
- Opening the owner's assigned gym system.

Do not build the mobile app until the tenancy and platform-boundary decisions are completed.

**DECIDED 2026-09-21 (D-038):** the app is **one cross-platform codebase shipped as real store
apps** on Android and iPhone — not a PWA, and not two separate native codebases. The existing PWA
(`public/manifest.webmanifest`, `public/sw.js`) **[verified]**) stays as the gym's own web surface.

**DECIDED 2026-09-21 (D-036):** entry is **in-app** — scan the gym's QR or search the gym name
against the platform registry. **No per-gym subdomains.**

## 16. Future main Yoyo platform admin panel

The new main platform admin panel belongs to the Yoyo platform owner.

It is separate from every existing gym admin panel.

It may include:

- Gym-owner applications.
- Document review.
- Approve application.
- Reject application.
- Request more information.
- Create gym tenant.
- Activate gym.
- Suspend gym.
- Reactivate gym.
- Manage gym owners.
- Manage subscriptions.
- Monitor gym activity.
- View aggregate gym statistics.
- Monitor platform finances.
- Search gyms.
- Search owners.
- Security alerts.
- Audit logs.
- Platform settings.

Do not mix main platform-admin permissions with existing gym-admin permissions.

Gym 1 must not see Gym 2 data.

## 17. Future gym-owner onboarding

The future owner process is not yet fully finalized.

The expected conceptual process is:

```text
Gym owner applies
→ Yoyo platform reviews application
→ Application approved or rejected
→ Gym tenant created
→ Owner receives verification link and code
→ Owner activates account
→ Subscription decision
→ Owner receives final access
→ Owner opens assigned existing gym admin panel
```

The following remain decisions **[undecided]**:

- Required documents.
- Approval rules.
- Review SLA.
- Rejection and appeal process.
- Trial period.
- Monthly pricing.
- Subscription enforcement.
- Payment provider.
- Whether payment method is required during trial.
- Whether owner ID is created before or after subscription activation.
- Whether subscriptions are purchased inside the mobile app or on the website.

Do not invent final answers.

## 18. Subscription plans

Three tiers, gated on **active member count** plus a small number of genuinely premium features.
Written 2026-09-22 from the feature inventory in `vault/02` and from market research, replacing the
earlier placeholder. **Prices remain data, never constants** (see the end of this section).

### 18.1 What the market actually does — evidence, not assumption

Two models dominate gym-management software:

| Model | Who | Shape |
|---|---|---|
| **By member count, everything included** | Gymdesk, Mindbody, Zen Planner | $75 ≤50 members → $200 ≤400 |
| **By feature tier** | PushPress, TeamUp | Free / $159 / $229, then paid add-ons |

**The market's loudest complaint is add-on gouging** — a "$159/month" plan reaching $500–664/month
once the necessary modules are bought, and Gymdesk competes explicitly on *not* doing that.

Features the market consistently treats as **premium**: access control and hardware, marketing and
CRM ($20–329/mo), branded mobile apps ($39–100/mo), advanced analytics, multi-location.
Features it treats as **entry-level**: billing, scheduling, check-in, simple reporting.

**Consequence for Yoyo Gyms:** member count is the primary lever, because that is what this market
understands and it scales with the gym's own revenue. Feature gating is kept **deliberately light** —
enough to make upgrading worthwhile, not so much that the product feels crippled. **Yoyo's face
recognition maps exactly onto the market's "access control" premium category**, which makes it the
natural flagship of the top tier.

### 18.2 The three plans

**Every tier includes the whole of "core gym operation".** A gym that cannot register, check in,
charge and manage its members is not running; crippling that would produce bad software, not
upgrades.

| | **BASIC** | **MEDIUM** | **PRIME** |
|---|---|---|---|
| **Active members** | up to ~40 | up to ~150 | up to ~500 |
| **Locations** | 1 | 1 | 1 |
| Member registration (38-step flow, PAR-Q, agreements) | ✅ | ✅ | ✅ |
| Member list, 360 profile, quick actions | ✅ | ✅ | ✅ |
| Member portal (status, check-in, history, profile) | ✅ | ✅ | ✅ |
| Check-in — self, staff verification, today's overview | ✅ | ✅ | ✅ |
| Payment recording, receipts, arrears and aging | ✅ | ✅ | ✅ |
| Plans and add-ons catalog | ✅ | ✅ | ✅ |
| Gym settings, branding, logo | ✅ | ✅ | ✅ |
| Staff accounts and roles | ✅ | ✅ | ✅ |
| QR codes (gym and per-member) | ✅ | ✅ | ✅ |
| Membership card and ID card PDFs | ✅ | ✅ | ✅ |
| Automated member emails and reminders | ✅ | ✅ | ✅ |
| **Classes, bookings, waitlists, calendar** | ❌ | ✅ | ✅ |
| **Trainers and PT session logging** | ❌ | ✅ | ✅ |
| **Announcements and member messaging (inbox)** | ❌ | ✅ | ✅ |
| **Standard reporting** — attendance, revenue trend | ❌ | ✅ | ✅ |
| **Member progress tracking** | ❌ | ✅ | ✅ |
| **CSV import and export** | ❌ | ✅ | ✅ |
| **🔒 Face recognition — enrolment, face login, door scanner** | ❌ | ❌ | ✅ |
| **🔒 Visitors, incidents, access control** | ❌ | ❌ | ✅ |
| **🔒 Advanced analytics — churn, retention, peak hours, board PDF** | ❌ | ❌ | ✅ |
| **🔒 Bulk email broadcast (marketing)** | ❌ | ❌ | ✅ |
| **🔒 Referral programme** | ❌ | ❌ | ✅ |
| **🔒 Audit log** | ❌ | ❌ | ✅ |

**PRIME is the complete existing system.** Nothing is held back from it, and future premium
additions land there.

### 18.3 Pricing

**Prices are NOT set here and must never be hard-coded.** They live in
`platform_plans.price_cents`, as data.

Two facts for whoever sets them:

1. **There is no cost floor any more.** Since D-096 (schema-per-gym in one free Supabase project),
   the marginal infrastructure cost of a gym is **approximately zero**. The earlier "$10/gym/month
   floor" no longer applies. Pricing is a pure market decision.
2. **International rates are $75–200/month (≈R1,400–3,800).** South African independent gyms — the
   stated target market — are materially more price-sensitive than that. Pricing at international
   rates would be a strategic error; pricing is a market test, not a calculation.

### 18.4 Enforcement — where, and how it behaves

**Block, and offer the upgrade.** A refused action explains what the higher plan unlocks. A limit
nobody enforces is not a limit.

| What | Where it is enforced | Why there |
|---|---|---|
| **Feature access** | The **API routers** (`api/*/[...path].js`) | One fixed key map per router. 42 admin routes gated in ONE file — never a permission check added to 76 handlers |
| **Member limit** | `public/register.js` and `admin/members-import.js` | The only two places a member is created |
| **Navigation** | Client-side, from the gym's plan | **UX only.** Hiding a screen is tidiness; the router is the security |

**Rules:**

- The plan is resolved **server-side** from the gym registry, never sent by the client
  (`CLAUDE.md` §21).
- A blocked feature returns **402 Payment Required**, not 403 — it is a billing state, not a
  permission error, and the distinction matters for what the UI says.
- A gym **downgrading** below its current member count keeps its members. Existing data is never
  deleted by a plan change; only *new* registrations are blocked.
- Limits and feature maps are **data** in `platform_plans`, editable without a deploy.

### 18.5 Gap analysis — what this market sells that we have NOT built

Measured against the feature inventory in `vault/02` and the market research in §18.1. The market's
own "five core features" are member management, scheduling and booking, a member app, reporting, and
marketing automation.

**Where Yoyo GYM is already strong, and competitors charge extra:**

| Capability | Note |
|---|---|
| **Face recognition / biometric door** | Sold as "access control" add-on elsewhere. This is the differentiator |
| Digital waivers with signature | Indemnity + contract + signature, built in |
| PAR-Q health screening | Built in. Rare in this market |
| Per-gym branding | Name, logo, colour at runtime |
| Member 360 profile | Bookings, incidents, activity, receipts in one place |
| POPIA compliance posture | Consent, cascade erasure, deletion requests |

**Gaps — market-standard, NOT built:**

| # | Missing | Market position | Assessment |
|---|---|---|---|
| G-1 | **Automated recurring billing** | Treated as *standard* — "automated recurring billing, failed payment retry, clear financial reporting should be standard" | ⚠️ **Deliberately removed** (D-015/D-018). Members pay their gym directly. This is a conscious divergence from the market, not an oversight — but gyms **will** ask for it |
| G-2 | **Lead management / CRM / prospects** | Standard; a headline feature at Gymdesk and OfferingTree | **Not built.** No concept of a prospect who has not joined yet. The clearest genuine gap |
| G-3 | **Member app** | Standard; $39–100/mo add-on elsewhere | Planned — Capacitor, Stage 8 (D-053) |
| G-4 | **Marketing automation** | One of the five core features; $20–329/mo elsewhere | Partial. Bulk email exists; no sequences, triggers or campaigns |
| G-5 | **POS / retail** | "Sell apparel and supplements without a separate POS" | **Not built.** `addon_services` is adjacent but is not retail |
| G-6 | **Member SMS** | Common | **Not built.** Owner gets WhatsApp/Telegram; members get email only |
| G-7 | **Website builder** | Included by Gymdesk, $99/mo at Zen Planner | **Not built.** Only a public profile page per gym |
| G-8 | **Workout programming** | $79+/mo elsewhere (PushPress Train) | Partial. Trainers log workout *notes*; no programmed workouts |
| G-9 | **Multi-location** | Standard at higher tiers | **Not built.** One location per plan, by design for now |
| G-10 | **Staff payroll / commission** | Common | **Not built** |

**How to read this list.** It is a menu, not a backlog. Most gyms will never ask for most of it. The
two worth watching are **G-1** (because the market assumes it and we removed it on purpose) and
**G-2** (because converting prospects is how a gym grows, and we have no concept of a prospect at
all).

**Rule: nothing here is built speculatively.** These are recorded so that when a gym owner asks for
one, we already know where it sits in the market and what it is worth. That is what the "anything
else you need?" question at §18.6 is for.

### 18.6 Asking the owner what else they need

Gym-owner registration asks, in plain words, **what else the gym needs that the system does not do**.
Free text, optional, stored on the application and surfaced in the platform panel.

It is not a feature request form. It is **demand evidence**: three gyms asking for the same thing is
worth more than any amount of speculation about what to build next, and it costs one text box.

Answers are read against §18.5 — if a request matches a known gap, that gap gains a real customer
attached to it.

## 19. Mobile-store compliance

Future Android and iPhone releases must meet current Google Play and Apple App Store requirements.

The future mobile implementation must plan for:

- Current Android target API requirements.
- Current iOS SDK requirements.
- Privacy policy.
- Data-safety disclosure.
- Apple privacy disclosure.
- Account deletion inside the app and through a web route.
- Clear consent for health, biometric, face, camera, document, and location data.
- Minimum required permissions.
- Secure authentication.
- Secure session storage.
- Server-side authorization.
- Tenant isolation.
- Rate limiting.
- Secure password recovery.
- Reviewer test accounts or review instructions.
- Store screenshots and metadata.
- Release notes.
- Crash monitoring.
- Real-device testing.
- QR/deep-link testing.
- Payment and subscription compliance.

Do not assume the app may use an external payment page for digital subscriptions without checking the applicable current Google Play and Apple rules.

Store rules change. **Verify current requirements at Stage 10, from the official store
documentation — never from this file and never from model memory.**

Relevant existing asset: `server/handlers/member/request-deletion.js` already exists **[verified]**
and is a starting point for the account-deletion requirement.

## 20. Sign-in methods

The existing member login must remain supported unless a future decision changes it.

Potential future methods include:

- Existing member number plus phone.
- Existing face login where legally and technically approved.
- Email and password.
- Phone verification.
- Google Sign-In.
- Apple Sign-In.
- Device biometrics for unlocking a secure session.

Do not force Google or Apple login onto existing members without a product and migration decision.

If third-party social sign-in is added to the iPhone app, evaluate Apple's Sign in with Apple requirements.

Do not store raw biometric data unnecessarily.

Use device biometrics where possible to unlock a secure credential instead of uploading raw face data.

**Current state to be aware of:** face templates (128-D face-api descriptors and 512-D ArcFace
vectors) are stored as `jsonb` in the `members` table **[verified]**. Any biometric retention
policy decision must account for data already held.

## 21. Security rules

Never expose:

- Supabase service-role keys.
- JWT secrets.
- Paystack secret keys.
- Brevo secrets.
- CallMeBot secrets.
- Private biometric data.
- Health data.
- Passwords.
- Reusable verification secrets.

The frontend must never be trusted to define:

- Role.
- Gym identity.
- Tenant access.
- Payment amount.
- Membership status.
- Permission level.

All sensitive authorization must be enforced server-side.

All future tenant-owned records must have a trustworthy gym ownership relationship.

Review current service-role database access before introducing mobile clients.

Review RLS policies before exposing Supabase directly to mobile clients.

**Standing note:** today the server holds the service-role key and the browser never talks to
Supabase directly. That single property is what currently makes the default-deny RLS posture safe.
Any design that puts a Supabase client in a mobile app invalidates it and requires real RLS policies
first.

## 22. Existing deployment

The existing deployment uses:

- Vercel.
- Supabase.
- Environment-variable-based gym configuration.
- Three Vercel cron jobs.
- GitHub Actions CI.
- Existing tests.
- Error capture.
- Rate limiting support.

Do not assume the current one-project-per-gym deployment model is suitable for 10,000 gyms.

Evaluate provisioning, cost, migrations, environment variables, monitoring, backups, upgrades, and support before choosing the final tenancy model.

Plan-limit note: Vercel restricts cron count and Serverless Function count per plan, which is why
logic lives outside `api/`. Any tenancy model must be costed against these limits.

## 23. Major architecture decision

The first major decision is the tenancy model.

Evaluate honestly:

### Model A: separate deployment and Supabase project per gym

Advantages:

- Strong isolation.
- Existing single-gym code can remain mostly unchanged.
- Existing environment-variable model remains familiar.

Risks:

- Approximately 10,000 Supabase projects.
- Approximately 10,000 environment configurations.
- Many deployment and migration processes.
- High operational complexity.
- Difficult monitoring and upgrades.
- High provisioning burden.

### Model B: shared database and shared deployment

Advantages:

- Easier to operate many gyms.
- Centralized updates.
- Centralized monitoring.
- Lower provisioning overhead.

Risks:

- Requires gym ownership across tables.
- Requires changes to routes and handlers.
- Requires strong tenant authorization.
- Requires RLS design and testing.
- May change existing assumptions.

### Model C: hybrid or sharded model

Advantages:

- Can preserve stronger isolation than a fully pooled model.
- Can reduce operational burden compared with one project per gym.
- May allow staged migration.

Risks:

- More complex routing.
- More complex provisioning.
- More complex support and monitoring.
- Requires careful boundary design.

Do not choose the model automatically.

## 24. Platform boundary

Before implementation, decide how the future platform reaches each gym:

- Subdomain.
- Gym-specific path.
- Routing table.
- Separate deployment URL.
- API gateway.
- Mobile deep link.
- A hybrid of these.

The platform must reliably resolve:

```text
User
→ Role
→ Gym
→ Existing gym system
→ Allowed screen and data
```

## 25. Member identity decision

The current member login is gym-scoped:

```text
Membership number + phone
```

Determine later whether:

- A person has a separate member identity per gym.
- One person has one Yoyo identity across gyms.
- A person can belong to multiple gyms.
- Membership numbers remain gym-scoped.
- A platform-level identity is added later.

Do not change member identity behavior until this decision is made.

Constraint to carry into the decision: `membership_number` is `unique` **within one gym database**
**[verified]**. Under Model A it is not globally unique across gyms; under Model B uniqueness would
have to be scoped per gym rather than global. Phone numbers are not unique under either model.

## 26. Obsidian second brain

**The Obsidian vault plus Graphify is this project's memory of record.** Chat history and Claude's
own memory files are not. They are convenience only, they go stale (§29 proves it), and they are
invisible to the user. Anything that must survive — a decision, a finding, a failure, a fix, a
rejected idea — belongs in the vault, linked to related notes, not in a conversation.

Use the repository's Obsidian vault as the project's second brain.

Vault location:

```text
C:\Users\mule\OneDrive\Desktop\Yoyo GYM\
```

The vault **is** the repository root — `.obsidian/` sits beside the source code.

The vault currently has zero project notes.

The vault contains Obsidian configuration and plugins, including:

- Dataview.
- Smart Connections.
- Omnisearch.
- Templater.
- InfraNodus graph view.
- 3D graph.
- Excalidraw.
- Realclaudian.

There is no Obsidian plugin named Graphify.

Graphify is a CLI tool, currently installed as:

```text
graphifyy 0.9.65
```

It generates an Obsidian vault via `graphify <path> --obsidian --obsidian-dir <vault>`. It has
never been run on this project (no `graphify-out/` exists).

Graphify should be used only after confirming the desired vault structure and obtaining permission to create notes.

The current graph capability comes from:

- Obsidian native Graph View.
- InfraNodus graph view.
- 3D graph.
- Graphify CLI integration.

Do not automatically create vault notes.

**Open item:** `.obsidian/` and `.smart-env/` are currently **untracked in git**. Whether vault
notes are committed is **[undecided]** (§30) and must be settled at the Stage 2 gate, because it
determines whether project knowledge is shared or local-only.

## 27. Obsidian rules

Before making important decisions:

1. Search the vault.
2. Read related notes.
3. Check the decision log.
4. Check for conflicts.
5. Record the decision after approval.
6. Link related notes.

Use links such as:

- `[[Project Purpose]]`
- `[[Existing Yoyo Gym Audit]]`
- `[[Yoyo Gyms Architecture]]`
- `[[Tenant Architecture]]`
- `[[Owner Registration Flow]]`
- `[[Member Entry Flow]]`
- `[[Main Platform Admin Panel]]`
- `[[Subscription Decisions]]`
- `[[Mobile App Requirements]]`
- `[[QR Code Architecture]]`
- `[[Security Requirements]]`
- `[[Open Questions]]`
- `[[Decision Log]]`

If implementation fails, consult the relevant Obsidian notes before proposing recovery.

### 27.1 Failure protocol — investigate, never guess

When something fails — a build, a test, a deploy, a migration, a login, a scan, a payment — **do not
guess at the cause and do not guess at the fix.** Work in this order:

1. **Read the actual error.** Full text, full stack, the real log — not a summary of it.
2. **Search the vault** (Omnisearch / Smart Connections / Graphify) for this component, this error,
   and this area of the system. A past decision or a past failure may already explain it.
3. **Check `[[Decision Log]]` and `[[Open Questions]]`** — the behaviour may be intentional, or a
   known unresolved item.
4. **Read the actual code and configuration** that produced the failure. Verify, do not assume.
5. **Only then** form a hypothesis, and say plainly which parts are confirmed and which are still
   uncertain.
6. **Record the failure and its resolution in the vault**, linked to the affected component, so the
   next occurrence is answered from notes rather than rediscovered.

If the cause genuinely cannot be determined, say so and say what evidence is missing. Never present
a guess as a finding. Never invent a cause to close a question.

### 27.2 Graphify as the retrieval layer

Graphify (`graphifyy 0.9.65`, §26) builds the queryable knowledge graph over the vault and the
codebase — use it to find how requirements, decisions, files and failures connect before answering
architecture questions. It is **opt-in**: run it only with permission, and write its vault output to
the agreed structure (§28), never scattered.

**Current gap, stated honestly:** the vault has zero notes today, so there is nothing to consult
yet. Until Stage 2 creates the note structure, this protocol has no memory to draw on — which is
the strongest argument for doing Stage 2 promptly after the Stage 1 decision.

## 28. Obsidian documentation to create later

The future vault should contain:

```text
00 - Project Purpose
01 - Existing Yoyo Gym Audit
02 - Confirmed Existing Features
03 - Protected Existing Functions
04 - Yoyo Gyms Platform
05 - Main Platform Admin Panel
06 - Tenant Architecture
07 - Owner Workflows
08 - Member Workflows
09 - QR-Code Architecture
10 - Mobile App
11 - Subscription Decisions
12 - Database Architecture
13 - Authentication and Roles
14 - Security and Privacy
15 - Store Compliance
16 - API Documentation
17 - Open Questions
18 - Decision Log
19 - Implementation Phases
20 - Change History
```

The vault structure must not be created until the architecture decisions are reviewed.

## 29. Source-of-truth rules

Use the following priority order:

1. Explicit user decision in the current project discussion.
2. Approved decision recorded in the Obsidian decision log.
3. Confirmed repository behavior.
4. Confirmed database migrations and configuration.
5. Previous Claude Code audit.
6. Provisional proposals.
7. General assumptions.

Never treat a provisional proposal as a final decision.

**The previous single-gym discovery result was not found.** It was searched for in the repository,
the vault, git history (both added and deleted files), and the user's home directory. It does not
exist on this machine. Do not reconstruct it from memory or imagination. If it is supplied later,
reconcile it against this file and report every conflict.

The repository inspection of 2026-09-21 is currently the source of confirmed single-gym findings.

Do not treat `session-progress.md` in Claude's memory directory as authoritative. It is a build log
and it is **stale**: it names `74d4646` as HEAD, while HEAD is `c68c8c9` with four later commits it
does not describe.

## 30. Current confirmed unknowns

The following are not finalized **[undecided]**:

- Tenancy model.
- Platform location.
- Subscription plans.
- Subscription prices.
- Trial period.
- Payment flow for gym-owner subscriptions.
- Platform revenue model.
- Whether Yoyo takes a share of member payments.
- Owner application documents.
- Owner approval rules.
- Owner activation sequence.
- Mobile framework.
- App-store billing strategy.
- Global versus gym-scoped member identity.
- Biometric retention policy.
- Face-recognition legal and technical model.
- Obsidian note versioning.
- Whether vault notes are committed to Git.
- Provisioning model for 10,000 gyms.
- Whether platform code lives in this repository, a sibling repository, or a monorepo.
- ~~Jurisdictions beyond South Africa.~~ **DECIDED 2026-09-22 (D-125): worldwide.** What remains
  open is per-jurisdiction *data-protection law*, not whether the product serves them.
- Object storage strategy for photos and biometric templates.

Do not make these decisions without explicit approval.

## 31. Development workflow

Before coding a major feature:

1. Read this file.
2. Search the Obsidian vault.
3. Read relevant audit and decision notes.
4. Inspect the existing code.
5. Confirm whether the feature already exists.
6. Identify protected existing behavior.
7. Write a plan.
8. Ask for approval if the change affects existing functionality.
9. Implement the smallest safe change.
10. Run tests.
11. Test authentication and permissions.
12. Test tenant isolation.
13. Update documentation.
14. Record the decision and implementation in Obsidian.
15. Review the diff.
16. Do not deploy without approval.

## 32. Do not change without approval

Do not change:

- Existing member registration.
- Existing member login.
- Existing gym admin login.
- Existing gym admin routes.
- Existing gym database structure.
- Existing payment logic.
- Existing PDFs.
- Existing member IDs.
- Existing QR behavior.
- Existing trainer behavior.
- Existing roles.
- Existing deployment model.
- Existing authentication model.
- Existing production environment variables.

If a change is necessary, explain:

- Why it is necessary.
- What existing behavior it affects.
- What risks exist.
- How rollback would work.
- What tests are required.

## 33. Current task after this file

Do not immediately implement the whole Yoyo Gyms platform.

First:

1. Verify that this file does not contradict the repository.
2. Identify missing or conflicting requirements.
3. Review the tenancy options.
4. Review the platform boundary.
5. Review member identity.
6. Review owner onboarding.
7. Review subscriptions.
8. Review mobile architecture.
9. Review store compliance.
10. Review the Obsidian documentation plan.
11. Ask for approval before implementation.

The next implementation phase must be explicitly approved.

Items 1 and 2 were carried out on 2026-09-21. Three corrections were applied to the draft of this
file as a result; they are recorded in §5, §6, §8, §11 and §29.

---

## 34. Build stages and gates

**Binding rule.** Work proceeds one stage at a time. A stage is **not** finished when the code is
written — it is finished when its **exit criteria** are met and the user has confirmed the gate.
Claude must:

- Work only inside the currently open stage.
- Refuse to start stage N+1 while stage N is open, and say which gate is blocking.
- Not silently pull work forward from a later stage to "save time".
- At the end of a stage, state plainly what was done, what was verified, what was skipped and why,
  then **stop and ask** for the gate decision.
- If a stage cannot be completed, finish everything in it that is not blocked, then report the
  blocker rather than moving on.

Only **one** stage is open at any time. The open stage is recorded in §35.

| Stage | Name | Produces | Exit criteria (gate) |
|---|---|---|---|
| 0 | Discovery and documentation | Repository audit, this file, vault plan | This file approved; previous audit supplied or formally declared absent |
| 1 | **Tenancy decision** | Written comparison of Models A / B / C with real costs at 10,000 gyms; one model chosen | User explicitly chooses a model and it is recorded in the decision log. **Blocks every stage below.** |
| 2 | Obsidian vault foundation | Notes 00–20 per §28, decision log started, git-tracking question answered | Vault structure approved; §26 open item resolved |
| 3 | Platform data model | Gym registry, applications, documents, subscriptions, platform audit — **platform-side only; the existing 24 tables are untouched** | Schema reviewed; §32 confirmed not violated; migrations written but not executed without approval |
| 4 | Platform boundary and gym resolution | How the platform reaches a gym (§24); the resolution chain `User → Role → Gym → System → Data` | Boundary approved; isolation test plan written |
| 5 | Main platform admin panel | Platform-owner panel (§16), with auth separate from gym admin auth | Panel works; **Gym 1 cannot see Gym 2 data, proven by an automated test** |
| 6 | Owner onboarding and provisioning | Application → review → approve → tenant creation → activation (§17) | One owner onboarded end-to-end on a test gym; `/api/document` two-secret pattern re-reviewed |
| 7 | Subscriptions | Plans as data, enforcement, billing (§18) | Tiers and prices supplied by the user; nothing hard-coded; billing tested |
| 8 | Mobile application | Shared Android/iOS app (§15); the §2 skill is installed when this stage opens | Gym search, QR entry and both logins work against a real tenant |
| 9 | QR and deep links | Gym-specific routing, Android App Links, Apple Universal Links (§14) | Verified on real Android and iOS devices, both app-installed and not-installed paths |
| 10 | Store compliance and release | §19 checklist, privacy, deletion, metadata | Current store rules re-verified from official documentation at this stage; builds accepted |

Stages 1 and 2 may be discussed together, but Stage 2 notes cannot be finalised until the Stage 1
decision exists to be recorded.

## 35. Stage status

```text
BUILT 2026-09-22 — STAGES 4-7, code complete, NOT DEPLOYED, NOT PUSHED.
  222 tests pass. Vault validates. No SQL has been run against any database.

  Stage 4  boundary + resolution ....... platform/ imports nothing from server/
                                         or src/ (verified); AsyncLocalStorage
                                         resolution at getSupabase()
  Stage 5  platform admin panel ........ login (2FA required), application
                                         queue, decisions, GYM REGISTRY,
                                         suspend/reactivate, drift report
  Stage 6  onboarding + provisioning ... public /platform/apply, 7-step
                                         provisioner (schema-per-gym), trial
                                         opened as part of provisioning
  Stage 7  subscriptions ............... plans as data, entitlement gating,
                                         trial -> charge -> grace -> suspend,
                                         Paystack webhook, nightly cron
  Also     member-facing gym finder at /platform/find; public gym search API

  DEFAULTS THAT MATTER: provisioning is a DRY RUN unless
  PLATFORM_PROVISION_LIVE=true; billing is a DRY RUN unless
  PLATFORM_BILLING_LIVE=true. Neither moves without an explicit env var.

  NOT BUILT: Stage 8 (Capacitor mobile app), Stage 9 (deep links),
             Stage 10 (store compliance). Application document upload
             (Supabase Storage + multipart) is still unwired.

  ALSO BUILT 2026-09-22 (second pass): owner activation (link + 6-digit code,
  hashes only), gym-owner login (password; staff still need 2FA), the owner's
  own page at /platform/my-gym, and application document upload straight to
  Supabase Storage via signed URL. 270 tests pass.

  ARCHITECTURE REVIEW 2026-09-22 — four surfaces verified, four defects found:
    F-1  NOT FIXED, protected surface. server/lib/auth.js verifyToken() does
         not check the token audience, and memberauth.js signs with the SAME
         JWT_SECRET. A MEMBER TOKEN IS A STRUCTURALLY VALID ADMIN TOKEN.
         Reproduced. 4 handlers use bare authenticate() with no role check.
         One-line backward-compatible fix written and awaiting approval in
         vault/17 §0.2. DO NOT deploy the platform on a gym's domain first.
    F-2  FIXED. platform/auth.js fell back to JWT_SECRET; combined with F-1 a
         platform session would have been accepted by the gym API.
    F-3  FIXED. /platform/applications needed only a session — any gym owner
         could read every competitor's application and documents.
    F-4  FIXED. A dependency-factory collision silently dropped the suspend
         reason and the subscription re-sync.

  THIRD PASS 2026-09-22: document review loop (open a document via a 5-minute
  signed URL, audited; accept/reject with a reason), retention purge (D-054,
  own switch PLATFORM_RETENTION_LIVE), and the Stage 6 gate review of
  /api/document. 292 tests pass.

  STAGE 6 GATE ITEM DONE — /api/document re-reviewed (D-123). D-034 assumed
  the risk was GUESSING; measurement says otherwise. The code is 40 bits
  (1.1e12), ~35 years at 1000 req/s, so brute force is not the threat. The
  threat is select('*'), which returns id_number (SA ID) and the biometric
  face templates, plus PAR-Q health data, to anyone holding a permanent
  reusable code, with NO rate limiting. Recommended and NOT APPLIED (protected
  surface): (1) explicit column list, (2) per-gym rate limit — neither breaks
  anything; (3) session-binding is the real fix and is your decision.

  VAULT CORRECTED (D-122): vault/14 claimed admin/member token separation
  "rests entirely on the audience claim". It rests on nothing — see F-1.

  ALL THREE OPEN DECISIONS ANSWERED BY THE USER 2026-09-22, AND APPLIED:
    Q-46 (D-124) — verifying the owner's email OPENS THE GYM. D-049 superseded.
    F-1  (D-126) — verifyToken() now refuses a foreign audience. Written as
                   "reject foreign aud", not "require aud===admin", so NO LIVE
                   SESSION IS LOGGED OUT. 8 tests.
    D-123 (D-127) — /api/document returns an explicit 18-column list (no ID
                   number, no biometric templates) and is rate limited 10/min.
                   Option 3, session-binding, is still open.

  WORLDWIDE (D-125, user 2026-09-22) — resolves the §30 open item on
  jurisdictions. "Local" belongs to the GYM, not the software: HOME_COUNTRY is
  now a FALLBACK, homeCountryFor(gym.country) is the answer. Only ZA keeps a
  strict ID format check, because the SA ID is the only one this codebase can
  validate. §5 and §30 below are updated accordingly.

  PLATFORM PANEL COMPLETED 2026-09-22 (D-128/D-129), after the user asked
  whether it was really built. It was half built. Added: plans and prices
  (price_cents was NULL and nothing could set it — BILLING WAS CHARGING
  NOBODY), the audit log reader (everything wrote, nothing read), gym and
  owner search, owner deactivation, a finance summary, and moving one gym to
  another plan. §16 is now covered except the three items below.

  STILL NOT BUILT, stated plainly:
    · Monitor gym activity — no activity feed.
    · Per-gym member statistics — NOT an oversight. §16 asks for them and
      D-044 says support must never see member data; counting means reaching
      into a gym's schema, which is the boundary the POPIA position rests on
      (D-014). Raised as D-130 rather than quietly crossed.
    · Security alerts — the audit log filter is the nearest thing today.

  SURFACES CORRECTED BY THE USER 2026-09-22 (D-133/D-134):
    THE WEBSITE IS ONLY THE MAIN ADMIN PANEL — Yoyo staff, HTML, cookies.
    THE APP is for gym owners and gym members — JSON, Bearer tokens.
    ONE BACKEND: platform/api.js calls the SAME injected dependencies as the
    HTML routes, so a rule is enforced in one place and both doors get it.
    /apply, /activate, /my-gym, /find still render HTML, but as the WEB
    FALLBACK §14 already requires (activation email link, scanned QR, app not
    installed) — each has a JSON twin which is the primary path.
    No app route approves an application or suspends a gym.

  LIVE 2026-09-23 — THE ARCHITECTURE IS PROVEN ON REAL DATA.
    SQL run in the existing Supabase project. Owner account claimed with 2FA.
    The panel works: applications, registry, owners, plans, finances,
    security, audit, account.
    KOM is tenant #1 — the existing gym, WITHOUT MOVING ANY DATA. Its
    gym_connections.schema_name is simply 'gym', the schema the records were
    already in (D-146). /platform/registry shows it with a live member count;
    /g/kom/member resolves through gymcontext -> resolveGym -> runWithGym ->
    getSupabase and serves the real member portal.
    The website root now redirects to /platform/login.

  536 tests pass.

  SUPERSEDED BLOCKING QUESTION (kept for history): Q-46 — D-049 (first payment activates) and D-070 (30-day
  trial) contradict each other. A trialing gym currently cannot serve traffic.
  See vault/17 §0.1 for the three options.

STAGE 1 DECIDED (D-016, 2026-09-21) — TENANCY MODEL:
  One shared application deployment + one Supabase project per gym.
  Gym resolution injected at getSupabase(). Per-gym secrets store.
  Orchestrated migration runner. Each gym's data stays physically separate.
  ACCEPTED RISK: U-1, max Supabase projects per organisation, is undocumented.
  If a ceiling exists below target, D-016 and D-014 must both be reopened.

CLOSED:       Stage 0, Stage 1, Stage 2, Stage 3
              Stage 3 = platform data model APPROVED (D-022), 14 tables designed.
              APPROVED IS NOT BUILT: no table exists, no migration written.
OPEN STAGE:   none — awaiting the user's word on which opens next
READY:        Stage 4 (platform boundary and gym resolution)
              Payment-removal slot — design in vault/21, awaiting approval.
              Order is load-bearing: wire activation into manual capture FIRST
              (D-017), verify, THEN remove. Reversed, every newly registered
              member is stranded at status 'new'.
              D-021: server/lib/paystack.js is KEPT — platform billing needs it.

--- superseded status below, retained for history ---
OPEN STAGE:   Stage 2 — Obsidian vault foundation (audit note delivered)
CLOSED:       Stage 0 — Discovery and documentation
              · this file approved as written (user, 2026-09-21)
              · previous single-gym audit declared PERMANENTLY ABSENT (user, 2026-09-21)
              · the 2026-09-21 repository inspection is the source of truth
DEFERRED:     Stage 1 — Tenancy decision. Explicitly NOT open by user instruction;
              Stage 2 was brought forward so the decision is made against written
              evidence. Stage 1 still gates Stages 3-10.
VAULT:        vault/ at the repository root. All 21 notes (00-20) created and
              cross-linked; every note carries YAML aliases so both
              [[Existing Yoyo Gym Audit]] and [[01 - Existing Yoyo Gym Audit]] resolve.
              Q-25..Q-29 resolved from code. Graphify NOT yet run (awaiting approval).
OPEN IN S2:   Q-23 — are vault notes committed to git? .obsidian/, .smart-env/,
              CLAUDE.md and vault/ are all still untracked.
NEXT:         Evaluate tenancy options, then open Stage 1.
LAST UPDATED: 2026-09-22
```

Claude updates this block when a gate is passed, and only after the user has approved the pass.

---

## 36. App landing screen — user instruction (2026-09-28)

> Added by the user's instruction on 2026-09-28. The text below is the user's own, word for word;
> only the heading levels were lowered so it sits inside this file's numbering. Where it conflicts
> with the repository or with an earlier decision, the user answers the question one at a time and
> the answer is recorded in §36.1 — **§36.1 wins over the text above it**. The `mobile-app-ui-design`
> skill (§2) applies to this work.

### Yoyo App Landing Screen

When a person opens the **Yoyo app**, the first screen should feel like a premium fitness platform—not like an admin dashboard or a confusing registration form.

The app should immediately explain that Yoyo connects people to their gym, then give them two clear choices:

- **I’m a Member**
- **I’m a Gym Owner**

Use a modern dark fitness style with strong photography, clean spacing, high contrast, and one bright accent color. Professional fitness apps commonly use a visual welcome screen followed by clear sign-in or registration choices.

#### First screen layout

##### Top area

Place the Yoyo logo at the top center or upper left.

Logo concept:

```text
YOYO
GYMS
```

Use a clean geometric wordmark. The logo should be simple enough to recognize as an app icon.

Add a small location or language control in the top-right corner if needed, but do not overcrowd the screen.

##### Main visual

Use a large, high-quality photograph showing:

- A confident gym member training.
- Modern gym equipment.
- Clean dark background.
- Strong directional lighting.
- A feeling of energy, discipline, and progress.
- No visible brand logos from another company.
- No excessive bodybuilder posing.
- A realistic, inclusive fitness environment.

The image should occupy approximately the upper half of the screen.

##### Main message

Place this text below or partly over the image:

```text
YOUR GYM.
YOUR JOURNEY.
```

Supporting text:

```text
Connect to your gym, manage your membership,
and stay committed to your goals.
```

##### Main buttons

Use two large buttons:

```text
I’M A MEMBER
```

and:

```text
I’M A GYM OWNER
```

The member button should be the primary bright accent button.

The owner button should be a dark or outlined secondary button.

##### Smaller link

At the bottom:

```text
Already have an account? Sign in
```

However, because member and owner login are different, a better first-screen structure is:

```text
I’M A MEMBER
I’M A GYM OWNER
```

The next screen then provides the correct login or registration choices.

#### Recommended first screen

```text
┌──────────────────────────────┐
│          YOYO GYMS            │
│                              │
│     [large gym photograph]    │
│                              │
│       YOUR GYM.               │
│       YOUR JOURNEY.           │
│                              │
│ Connect to your gym, manage   │
│ your membership, and grow.   │
│                              │
│       [ I'M A MEMBER ]        │
│                              │
│      [ I'M A GYM OWNER ]      │
│                              │
│       Privacy   Help          │
└──────────────────────────────┘
```

#### Member path

When the person taps **I’M A MEMBER**, show:

```text
Welcome, Member
```

Then provide:

```text
Find my gym
Scan gym QR code
I already know my gym
```

The member must identify the gym before login or registration.

After selecting the gym, show:

```text
Welcome to [Gym Name]

[ New member registration ]
[ Existing member login ]
```

This is important because the member belongs to a specific gym.

##### New member screen

```text
Join [Gym Name]

Create your membership and get started.

[ Start registration ]

Already a member?
[ Sign in instead ]
```

##### Existing member screen

```text
Sign in to [Gym Name]

Membership number
[________________]

Phone number
[________________]

[ Sign in ]

[ Scan gym QR code ]
[ Need help? ]
```

The current Yoyo Gym member login uses membership number and phone number, so the visual design should not show email and password as the primary existing login unless the authentication system is later changed.

#### Gym-owner path

When the person taps **I’M A GYM OWNER**, show:

```text
Welcome, Gym Owner
```

Then provide:

```text
Apply to join Yoyo Gyms
Owner login
Check application status
```

##### Owner application screen

```text
Bring your gym to Yoyo

Manage members, payments, attendance,
trainers, classes, and daily gym operations.

[ Apply as a gym owner ]
```

The application process may then request:

- Owner name.
- Email.
- Phone number.
- Gym name.
- Gym address.
- Business information.
- Required verification documents.

##### Owner login screen

```text
Gym owner login

Email or username
[________________]

Password
[________________]

[ Sign in ]

Forgot password?
[ Apply as a gym owner ]
```

The owner login should lead to the owner’s individual **Yoyo Gym admin panel**, not directly to the main Yoyo platform admin panel.

#### Main admin panel access

The main platform admin panel is a **website**, not the normal first screen of the mobile app.

It should be accessed through a separate address such as:

```text
admin.yoyogyms.com
```

or:

```text
platform.yoyogyms.com
```

Only Yoyo platform administrators should use it.

The first mobile app screen should not prominently display:

```text
Main Admin Login
```

If needed, add it discreetly under:

```text
Help
```

or:

```text
Staff access
```

The platform admin website should have its own professional login screen:

```text
Yoyo Gyms Platform

Platform administrator login

Email
[________________]

Password
[________________]

[ Sign in ]

Forgot password?
```

#### Visual design direction

Use:

- Dark charcoal or near-black background.
- White typography.
- One bright lime, electric green, orange, or blue accent.
- Large rounded buttons.
- Rounded cards.
- High-quality realistic gym photography.
- Subtle gradients.
- Minimal icons.
- Strong visual hierarchy.
- Generous spacing.
- Large readable text.
- Accessible contrast.

Avoid:

- Too many buttons on the first screen.
- Multiple unrelated login forms.
- Showing gym-owner tools to members.
- Showing platform-admin controls in the mobile app.
- Generic stock-photo appearance.
- Excessive neon effects.
- Tiny text.
- A crowded dashboard on the landing page.

#### Image-generation prompt

Use this prompt to generate the visual concept:

```text
Create a premium mobile app landing-screen design for “YOYO GYMS,” a modern gym membership platform for Android and iPhone.

Show a single polished smartphone screen in a professional product-design presentation. The screen has a dark charcoal and black background with subtle gradients, crisp white typography, and a refined electric-lime accent color.

At the top, display the clean modern wordmark “YOYO GYMS.” The upper half of the screen features a high-quality realistic photograph of a confident adult gym member training in a modern, well-lit fitness facility, with black gym equipment, dramatic directional lighting, and an energetic but premium atmosphere. The image should feel authentic, inclusive, and professional, with no visible third-party logos.

Below the image, display the exact headline:
“YOUR GYM. YOUR JOURNEY.”

Add the supporting text:
“Connect to your gym, manage your membership, and stay committed to your goals.”

At the bottom, include two large rounded call-to-action buttons with excellent spacing:
“I’M A MEMBER”
“I’M A GYM OWNER”

The member button is filled with electric lime and dark text. The gym-owner button is outlined in white with a transparent dark interior. Add small, subtle “Privacy” and “Help” links at the bottom.

Design the screen as a real production-ready mobile interface, not a poster. Use a vertical 9:16 smartphone composition, modern UX layout, realistic mobile spacing, accessible typography, premium fitness-brand art direction, and perfectly readable text.
```

#### Important text accuracy

Tell the image generator to render these exact words:

```text
YOYO GYMS
YOUR GYM. YOUR JOURNEY.
Connect to your gym, manage your membership, and stay committed to your goals.
I’M A MEMBER
I’M A GYM OWNER
Privacy
Help
```

AI image generators can sometimes distort interface text. For the final app design, use the generated image for visual direction, then recreate the screen in Figma or the application itself with real text and buttons.

### 36.1 Clarifications — answered by the user, one at a time

Found by checking §36 against the repository on 2026-09-28. Each answer is recorded here as it is
given. Nothing in §36 is built until these are answered.

- **Already true in the code, no question needed:** the member picks the gym before signing in or
  registering (D-041); member sign-in is membership number + phone (§9) and stays so; "Start
  registration" opens the gym's existing registration flow unchanged (§10); an applicant sets a
  password when applying, so "Check application status" can be the owner signing in and seeing the
  status on their own page (`/platform/my-gym` already shows it).
- **Q1 — "Delete your account" (store requirement, §19).** The first screen's bottom row stays
  "Privacy · Help" exactly as designed. **Help** opens a small screen that includes "Delete your
  account", so it stays reachable inside the app.
- **Q2 — who the app is for, and where owner login goes.** In the user's words: the app is for
  **tenant gym owners** (their own gym's admin panel, or register as a gym owner) and **gym
  members** (register, or sign in at the gym they already belong to). The **main Yoyo Gyms admin
  panel has nothing to do with the app — it is website only.** In the app, owner login = pick the
  gym, then that gym's **existing admin login** (username + password, §8), unchanged. **Owner and
  all staff** (manager, reception, trainer) use this same door; each sees only what their role
  allows today. "Check application status" stays on the Yoyo account (email + password chosen when
  applying), because an applicant has no gym to sign in to yet.
- **Q3 — accent colour.** **Electric lime**, with dark text on lime buttons, replacing today's red
  on the Yoyo screens. Once a member is inside their gym, the member area keeps **that gym's own
  colour**, as today.
- **Q4 — the photograph.** The user generates it with the §36 image prompt and supplies the file.
  Claude crops it for the top half, compresses it for phones, fades it into the dark background,
  and **bundles it inside the app** so the first screen works with no signal. Until the file
  arrives, a dark placeholder stands in.
- **Q5 — "I already know my gym".** It **opens the gym saved on this phone**, by name (e.g.
  "Continue to KOM"), in one tap. With no saved gym it is hidden and only "Find my gym" and "Scan
  gym QR code" show. "Find my gym" keeps what it has today: search by name, "Use my location", and
  the "I don't remember which gym I joined" recovery (D-041).
- **Q6 — the scan button on "Sign in to [Gym Name]".** It becomes **"Scan my membership card"**.
  Scanning the member ID card's QR **fills in the membership number only**. It never signs anyone
  in; the member still enters their phone number (§14: a member-ID QR must not authenticate).
- **Q7 — the Help screen** holds all four: **contact Yoyo support**; **common questions** (forgot
  my membership number, my gym isn't listed, how do I cancel — each pointing to the member's gym,
  which owns the member's data); **Privacy policy + Delete your account** (Q1); and a small,
  discreet **Yoyo staff access** link to the main admin *website*. That link only leaves the app;
  no platform-admin control is ever shown inside the app (Q2). **Support contact:
  `hello@mulesoo.com`.**
- **Q8 — the main admin website login** is restyled to the §36 design ("Yoyo Gyms Platform —
  Platform administrator login", Email, Password, Forgot password?) and **keeps the 6-digit
  authenticator code** for Yoyo staff (Stage 5 requirement unchanged).
- **Q9 — the admin website address.** No domain is owned yet. It stays on the current Vercel
  address at `/platform/login`. `admin.yoyogyms.com` / `platform.yoyogyms.com` are future names;
  moving later is a Vercel domain setting plus one app config line, not a rebuild.
- **Q10 — language / location control.** **Not now.** The top of the first screen shows only the
  wordmark. A language switch is added when a second language actually exists.
- **Q11 — the images (2026-09-28).** The user supplies **two** files: the landing photograph with
  the Yoyo logo **already on it**, and the **logo on its own**. **Never add a second logo or
  wordmark over the photograph.** The standalone logo is used where there is no photo (other
  screens, app icon source). Building was approved the same day.
- **Q12 — owner login accepts the email (2026-09-28).** Testing the preview, the user signed in
  with KOM's owner EMAIL and was refused: the gym admin sign-in matched by username only (KOM's owner
  is `owner`). Approved: the sign-in box is now **"Email or username"** — username first, exactly as
  before, then the account's email (exact, any capitals), and only when exactly one account has it.
  Lockout, disabled accounts and the generic refusal are unchanged. A deliberate change to the
  protected gym admin login (§32), backward compatible.

All clarifications answered 2026-09-28. The build is the app's Yoyo screens
(`apps/mobile/www/`) plus the restyled admin-website login. Every gym's own screens, the member
login, registration, and the gym admin login are **not** changed (§32).

---

## 37. Brand rollout — the new colours and logo everywhere (user instruction, 2026-09-28)

> The user's words: *"apply colour app change the logo old one with new one and change everything
> colour use that colour, also be sure that the new colour and logo appear on all id, documents,
> pdf, and main admin panel the colour both main admin panel and …"* — clarified one question at a
> time below. This is an **approved controlled change** to protected surfaces (§32: PDFs, member IDs,
> gym admin screens): it changes colours and logos only, never behaviour, data or routes.

**The brand.** Near-black ground `#070C10`, white type, **electric lime `#BFF642`** as the one accent
(dark text `#0B1400` on it), and the user's logo (navy `#04162B` + purple `#6047A2` on light
backgrounds; white + purple `#8C65C8` on dark). The old red `#E63946` and the old red dumbbell icon
are retired as the default. One source of truth: `shared/brand.js`.

### 37.1 Clarifications — answered by the user

- **Q1 — where.** All four: the **main admin panel** (every page, not only the login), **each gym's
  admin panel**, the **member web pages**, and the **owner web pages**.
- **Q2 — whose brand on a gym's screens and documents.** **Yoyo is the default; a gym can change
  it.** Lime and the Yoyo Gyms logo replace red as the default everywhere. A gym that sets its own
  colour or logo in Settings → Gym Profile keeps them — and PDFs now **follow** that setting (they
  were hard-coded red). The gym's name is still printed on its documents.
  *This revises §36.1 Q3 only for the default: a gym's own saved colour still wins.*
- **Q3 — a saved colour that is exactly the old red.** **Kept.** Only gyms that never saved a colour
  turn lime. KOM stays red until its owner changes the colour in Settings. The Settings form
  pre-fills lime from now on.
- **Q4 — the app icon.** **The app logo itself, on a transparent background.** Verified against the
  store rules on 2026-09-28: Apple rejects any App Store icon with transparency (alpha channel), and
  Android always masks launcher icons into a shape. So: the browser-tab icon is the logo on a
  **transparent** background; the Android and iPhone icons are the logo on the **near-black**
  ground, which the stores require to be solid.

**Readability rule, from the brand itself:** text on an accent colour is chosen by contrast — dark
on light colours such as lime, white on dark ones such as red — so a gym's own colour never makes
its buttons unreadable. On white paper (PDFs, receipts), a light accent is used for bands and
rules, never for text.

- **Q5 — every gym's own NAME, everywhere (2026-09-28).** IDs, PDFs and screens still said "Yoyo
  GYM": KOM's own Settings held the old single-gym name, and ~20 places in the code had it written
  in. With the user's approval KOM's saved name became **"KOM"**, and "Yoyo GYM" became "KOM" in its
  saved welcome message, indemnity waiver and privacy policy (only the name; nothing else in the
  texts). In the code, a gym with no saved name shows its **Yoyo registry name**; defaults and
  printouts use the gym's own name. "Yoyo Gyms" is only ever the platform.
- **Q6 — a gym without a logo** shows a **letter badge** (its first letter in its own colour), and
  owners get an **Upload logo** button in Settings → Gym logo (PNG / JPG / WebP, shrunk to 256 px;
  the server refuses anything else, SVG included, and anything over 300 KB).
- **Q7 — which logo where.** The **gym's own icon on everything its members see**: the gym's
  welcome page, member registration, member sign-in, the member portal and the app's member
  screens. The **Yoyo Gyms logo stays on IDs, PDFs, the gym's admin panel and admin login**, with
  the gym's name printed beside it. *This replaces Q2's "a gym's own logo wins everywhere" for
  documents: documents always carry the Yoyo Gyms logo.*
- **Q8 — someone new** (no gym chosen yet, member or owner) sees the **Yoyo Gyms** front page.

---

## 38. Each gym's own app — after a member or owner belongs to a gym (user instruction, 2026-09-28)

> The user's words, word for word, from three messages on 2026-09-28. Clarified one question at a
> time in §38.1, which wins over the text above it. Not built until §38.1 is answered.

> also once person registar as spcific gym it must save his identity there and keep and desplay
> that gym on app not yoyo gym, my supposed treat each gym owners as their gym they ca what to
> desplay on app front mean landing page or front page, even member once register as specific gym
> and then signed in he keep sign in untill sign out, when he come check next day the app display
> his gym icon and picture, mean that once gym owner registerd and signed in as owner the app is
> his app yoyo gym logo desplay only neded place

> but for new member or gym owner it display as yoyo gym profetional apprance

> also during gym member regestration on choosed gym the specific gym icon must seen not yoyo gym
> ogo  *(built: §37.1 Q7)*

### 38.1 Clarifications — answered by the user, one at a time

Checked against the code on 2026-09-28:
- **Already true:** the app remembers the gym chosen on the phone (`yoyo.mygym`), and a member's
  session is kept per gym on the phone; someone new sees the Yoyo Gyms front page (§37.1 Q8).
- **Not yet true:** the app always OPENS on the Yoyo Gyms front page, even for a signed-in member.
- **A member session lasts 12 hours** (§9) and **a gym admin session 8 hours** (§8): "signed in until
  sign out" changes the protected authentication model (§32) and needs the user's decision.
- **There is no gym picture yet**, and no object storage is in use (§5, §30): a gym's cover
  picture needs a storage decision.
- **Q1 — a member opening the app again** goes **straight to their gym's home**: the gym's picture
  and icon at the top, then their status, one-tap check-in, card and classes. No Yoyo screen.
  "Switch gym" and "Sign out" live in their profile.
- **Q2 — a member stays signed in on their phone until they sign out** (was 12 hours; a deliberate
  change to the protected sign-in, §9/§32). Safeguards: the gym can sign a member out from its admin
  panel (lost phone); a suspended or cancelled membership still loses access; app only, not a shared
  browser.
- **Q3 — a gym owner (and staff) opening the app again** go **straight to their gym's admin panel**
  and **stay signed in until they sign out** (was 8 hours; a deliberate change, §8/§32). The owner can
  sign any staff device out from Staff settings; staff on shared front-desk devices still sign out
  at the end of a shift.
- **Q4 — what an owner sets for their gym's home in the app:** all four — a **cover picture**
  (uploaded in Settings); the **logo, name, colour and tagline**; a **welcome message and notices**
  (e.g. "Closed on Friday"); **opening hours and contact** (with call / map buttons).
- **Q5 — cover pictures live in Supabase Storage**, a public `gym-branding` bucket in the existing
  project (the platform already uses Supabase Storage for owner documents). Resolves the §30 open
  item "object storage" for gym branding images only — member photos and biometric templates are
  untouched and still undecided.

All five answered 2026-09-28. The user ran the SQL the same day (verified read-only: both
`session_version` columns and the public `gym-branding` bucket exist). **Built 2026-09-28** — vault
D-160: long sessions (app only) checked in the three routers against `session_version`; "sign out
everywhere" for members (member page) and staff (Staff page), and automatically on a staff password
reset or disable; the app reopens a member into their gym's home (cover, icon, notice, hours,
Call / Directions / Email) and an owner into their admin panel; Settings gains Cover picture
(uploaded straight to Storage with a one-time link) and Notice.


---

## 39. Stunning end to end — clear pictures, each gym's poster, the admin panel (user instruction, 2026-09-28)

> The user's words, word for word. Clarified one question at a time in §39.1, which wins over the
> text above it.

> on app the picture are not clearly display as profetional app i dont know may be is because its
> desktop or waiting for phone vertion fix it, also in each gym app bckground must have the poster
> that gym owner that app on app, the app must look stunning ebd to end, encluding admi pannel

### 39.1 Clarifications — answered by the user, one at a time

Checked against the code on 2026-09-28:
- **The landing photograph is only 941 × 956 pixels** — it was cut from the user's mockup, which
  was itself 941 wide. On a phone (390 points × 3 = 1170 pixels) it is stretched a little; on a
  wide computer screen the website shows it far larger than it is, so it looks soft. A sharper
  picture needs a larger original, or a layout that never shows it bigger than it is.
- **Each gym already has a cover picture** (§38.1 Q4), shown only at the top of its app home.
- **Q1 — where it looked unclear:** everywhere — the website on a computer and on a phone, and the
  phone app.
- **Q2 — the landing photo: keep the existing picture, NO upscaling** (the user, after a first
  choice of AI upscaling: the tools were blocked on this Windows machine, and the user said to stop
  and keep the picture). Every layout instead stops showing a picture larger than it really is —
  on a computer the photo sits in a phone-width panel; on newer phones it stays slightly soft.
- **Q3 — each gym's poster is a SEPARATE upload:** owners upload a tall poster (portrait, like a phone
  screen) in Settings. It is the dimmed background of the gym's screens; the cover picture stays
  the wide banner at the top of the app home.
- **Q4 — where the poster shows, and what "stunning" covers:** the poster behind **every member
  screen** (welcome page, registration, member sign-in, member portal, the app's gym home) and behind
  the **gym admin sign-in**; and a **redesign of the gym admin panel** (poster/logo in the sidebar
  header, a polished dashboard with stat cards, consistent cards and tables, mobile-first). The Yoyo
  pages (app front page, main admin website) are not part of this pass.

**Built 2026-09-28** — vault D-161: a separate **Poster (background)** upload in Settings (portrait,
≤ 1080 × 1920, Storage `poster-<time>.jpg` in the gym's own folder), shown darkened behind the
welcome page, registration, member sign-in, member portal, the app's member screens, the admin
sign-in and behind the gym's name in the admin sidebar; the website's welcome page shows the photo
in a phone-width panel on a computer, and the app's landing stays phone-width on a tablet, so the
941 px photo is never stretched; the admin panel redesigned — one family of line icons, the poster
and avatar in the sidebar, a calm "Needs attention" list instead of red banners, icon stat cards,
coloured status labels (green active, amber expiring, red suspended…) instead of red for everything,
softer cards, rounded buttons and fields.
