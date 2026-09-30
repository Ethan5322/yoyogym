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

## 2. Mobile design skill

The `mobile-app-ui-design` skill (in `.claude/skills/`) covers mobile screens, onboarding, owner and
member registration entry, gym search, QR entry, login, navigation and mobile UI components.

Do not use this skill to redesign the existing single-gym system without explicit approval.

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
- Six thin API routers under `api/*` (`[...path].js`, `auth`, `admin`, `member`, `cron`, `platform`)
  **[updated 2026-09-29]** — the member-payments router went with member payments (2026-09-21);
  `platform` serves the main admin panel and the app's JSON API.
- Business logic under `server/` — deliberately outside `api/` so only the six routers count as
  Serverless Functions against the Vercel plan limit.
- Supabase PostgreSQL.
- Database schema named `gym` — KOM's. Every further gym has its own schema `gym_<slug>` in the same
  project (D-096), and the platform registry is the `platform` schema **[updated 2026-09-29]**.
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
- Three Vercel cron jobs (`daily` 06:00, `daily-summary` 20:00, `weekly-schedule` Mon 07:00). Since
  2026-09-29 each runs for EVERY active gym inside its own schema (`server/lib/every-gym.js`), and the
  06:00 run also calls the platform's nightly job (billing, drift report, retention).
- Unit tests (`npm test`, `node --test` — 86 test files, 1122 tests on 2026-09-29) and GitHub Actions CI.
- Error capture (`server/lib/observability.js`) and rate limiting (`server/lib/ratelimit.js`,
  Upstash-ready with in-memory fallback).

Additional verified facts not previously recorded **[verified]**:

- **Object storage [updated 2026-09-29]:** Supabase Storage now holds gym branding (public
  `gym-branding` bucket — logo, cover, poster; §38.1 Q5) and gym-owner application documents (a private
  bucket, opened by 5-minute signed links). Member photos (`photo_url`) and face templates (`jsonb`) are
  still **inside Postgres** — their storage is still **[undecided]** (§30).
- `shared/` holds code used by both client and server: `pricing.js`, `countries.js`, `brand.js`,
  `features.js`, `facilities.js`, `member-directory.js`, `qr-payload.js`, `cors.js`, `yoyo-logo.js`.
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

The gym schema contains **31 tables** **[verified 2026-09-29 — counted in `db/schema.sql`]** (24 at the
start; the member services of §41 and later features added the rest); the list is in that file. The
platform's own 21 tables are in `platform/schema.sql`.

16 migrations exist in `db/migrations/`, latest `2026-09-29-member-services.sql` (the platform's own are in
`platform/migrations/`). Every table created by a migration also appears in `db/schema.sql`; the schema
file is the complete picture — and it is what builds every NEW gym's schema.

The schema does not use `gym_id` or `tenant_id`, and does not need to: the tenancy decision (D-016 →
D-096) isolates each gym in **its own schema**, so a gym's tables hold only that gym's rows.

## 7. Existing current tenancy model

**NOW [updated 2026-09-29] — decided (D-016, refined by D-096) and live:**

```text
One Vercel deployment + one Supabase project
+ one SCHEMA per gym (KOM = `gym`, each new gym = `gym_<slug>`)
+ the `platform` schema: the registry that says which gym is which, its plan and status
```

A request names its gym (`/g/<slug>/`, or the gym stamped in its session); `withGym` resolves it
through the registry and every query runs inside that gym's schema (`getSupabase()`). The rest of this
section is the single-gym starting point, kept as history.

**Before the platform,** the repository used:

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

- Username — or the account's email (§36.1 Q12). Owners can also sign in with email alone at
  `/owner/login`, their own gym checking the password (§43.1 Q2).
- Password.
- Bcrypt password verification.
- Generic login errors (never reveals whether a username exists).
- Five failed attempts causing a 15-minute lockout.
- Disabled-account checks.
- Eight-hour JWT sessions in a browser; in the app, until sign-out (§38.1 Q3).
- Role information in the JWT (`sub`, `username`, `role`, `full_name`, `trainer_id`).
- Face login for administrators (`/api/auth/face-login`).

The admin panel has **25 role-guarded routes plus an unguarded `/admin/login`**
**[verified in `src/App.jsx`, 2026-09-29]**. Settings and Staff are owner-only; Clients is trainer-only.

They are backed by 42 admin handlers under `server/handlers/admin/`.

Preserve these existing routes and functions unless a future approved integration requires a controlled change.

## 9. Existing member authentication

The current member login uses:

- Membership number.
- Phone number.
- A 12-hour member JWT in a browser; in the app, until sign-out (§38.1 Q2).
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

Implementation files are under `src/lib/` **[verified]**.

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
own origin, gym identity today is **implicit in the domain**. **[updated 2026-09-29]** Inside a gym's
own `/g/<slug>/` admin panel the QR codes carry that address, so each gym's codes open that gym.

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

**BUILT [updated 2026-09-29]:** the app is a Capacitor app in `apps/mobile` (Stage 8), not yet verified
on a real phone.

**DECIDED 2026-09-21 (D-038):** the app is **one cross-platform codebase shipped as real store
apps** on Android and iPhone — not a PWA, and not two separate native codebases. The existing PWA
(`public/manifest.webmanifest`, `public/sw.js`) stayed as the gym's own web surface — **REVERSED
2026-09-29 (§43.1 Q3): the website is no longer installable**; the only app is the store app.

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

**[updated 2026-09-29]** Decided since, and live:

- ~~Required documents.~~ ID, business registration, proof of address — each ACCEPTED by a reviewer (§40.1 Q3).
- ~~Approval rules.~~ A person approves; only a SUBMITTED application with the three accepted (§42).
- ~~Rejection and appeal process.~~ A reason is required and emailed; the owner may apply again; no formal appeal.
- ~~Trial period.~~ 30 days, opened when the gym is built.
- ~~Monthly pricing.~~ Data in `platform_plans`, set on the Plans page (§18).
- ~~Subscription enforcement.~~ §18.4; trial → charge → 2 days' grace → suspend.
- ~~Payment provider.~~ Paystack, card, monthly in advance (test mode first, §45.1 Q2).
- ~~Owner activation.~~ Verifying the emailed link + code opens the gym (D-124); links last 10 minutes,
  one a day (§43.1 Q1).

Still **[undecided]**:

- Review SLA.
- Whether a payment method is required during the trial (today it is not).
- Whether subscriptions are bought inside the mobile app or on the website (today: the website).

Do not invent final answers.

## 18. Subscription plans

Three tiers, gated on **active member count** plus a small number of genuinely premium features.
Written 2026-09-22 from the feature inventory in `vault/02` and from market research, replacing the
earlier placeholder. **Prices remain data, never constants** (see the end of this section).

**Prices are NOT set here and must never be hard-coded.** They live in
`platform_plans.price_cents`, as data.

Tier definitions (BASIC / MEDIUM / PRIME), market research, pricing context, the gap analysis and
the owner "what else do you need" question are in the `subscription-plans` skill
(`.claude/skills/subscription-plans/SKILL.md`). Load it before any work on plans, pricing,
entitlements or feature gating.

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

## 19. Mobile-store compliance

Future Android and iPhone releases must meet current Google Play and Apple App Store requirements.

The full release checklist (target API/SDK, privacy and data-safety disclosures, account deletion,
consent, reviewer accounts, metadata, device and deep-link testing) is in the `store-compliance`
skill (`.claude/skills/store-compliance/SKILL.md`) and `vault/15`.

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

**[updated 2026-09-29]** Gym OWNERS sign in with email + password (§43.1 Q2). Google and Apple sign-in
for owners is agreed in principle (§44.1) and **on hold** at the user's word.

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
- Environment variables for the deployment; each gym's own settings live in its own schema, and its
  plan and status in the registry **[updated 2026-09-29]**.
- Three Vercel cron jobs, run for every gym (see §5).
- Where things deploy (D-163): main-admin-panel fixes to production (`main`), app fixes to the
  preview (`stage-8-app`), until a domain exists.
- GitHub Actions CI.
- Existing tests.
- Error capture.
- Rate limiting support.

The model is ONE project with a schema per gym (D-096), not a project per gym. Known limits at
10,000 gyms are listed in §35.

Evaluate provisioning, cost, migrations, environment variables, monitoring, backups, upgrades, and support before choosing the final tenancy model.

Plan-limit note: Vercel restricts cron count and Serverless Function count per plan, which is why
logic lives outside `api/`. Any tenancy model must be costed against these limits.

## 23. Major architecture decision

The first major decision is the tenancy model.

**Decided — D-016, refined by D-096 (schema-per-gym).** The Model A / B / C evaluation is in
`vault/06 - Tenant Architecture.md`; §35 has the current status.

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

**[updated 2026-09-29]** The vault has 23 notes in `vault/` (00–22), tracked in git; the decision log is
`vault/18`, the change history `vault/20`. Obsidian's own settings (`.obsidian/`) stay local.

The vault's Obsidian plugins are in `.obsidian/plugins/`.

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

The vault now holds the decision log (`vault/18`) and the change history (`vault/20`) — consult them
before answering how something came to be.

## 28. Obsidian documentation

The vault exists at `vault/` (notes 00–22); `ls vault` lists them.

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

**[updated 2026-09-29]** Decided since (see the decision log):

- ~~Tenancy model.~~ One project, a schema per gym (D-016 → D-096).
- ~~Platform location.~~ This repository (`platform/`), the same deployment.
- ~~Subscription plans and prices.~~ Basic / Medium / Prime, as data (§18, §41).
- ~~Trial period.~~ 30 days. ~~Payment flow.~~ Paystack card, monthly (§45.1 Q2).
- ~~Platform revenue model.~~ The gym's monthly plan. ~~A share of member payments.~~ No — members
  pay their gym directly (2026-09-21).
- ~~Owner application documents, approval rules, activation sequence.~~ §40.1, §42, §43.
- ~~Mobile framework.~~ One Capacitor app for Android and iPhone (D-038).
- ~~Whether vault notes are committed.~~ Yes — `vault/` is in git.
- ~~Provisioning model.~~ The platform builds each gym's schema on approval (Stage 6).
- ~~Where platform code lives.~~ This repository.

Still not finalized **[undecided]**:

- App-store billing strategy (owners pay on the website today).
- Global versus gym-scoped member identity (gym-scoped today).
- Biometric retention policy.
- Face-recognition legal and technical model.
- Obsidian note versioning.
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
LAST UPDATED 2026-09-29 — checked against the code and the live data.

LIVE on production (yoyogym.vercel.app, branch main) and the preview
(stage-8-app) — the same commit. 1122 tests. Stages 0-7 are done and live.
  Tenancy (Stage 1): D-016 refined by D-096 — ONE Supabase project, ONE SCHEMA
    PER GYM, the registry in schema `platform`. KOM is tenant #1 in schema
    `gym` (D-146). COCATE GYM (gym_cocate_gym, Medium) is the first gym BUILT
    BY THE PLATFORM (2026-09-29); its owner has activated and signed in.
  Main admin panel (§16, §40): applications in three steps with the three
    required documents (§42); approve -> build the gym -> 10-minute activation
    link (§43); a failed build is retried from the application page (D-167);
    gyms (suspend, plan, services, owner, setup help), owners, team, plans and
    prices, finances, security, audit, settings.
  Each gym: its own admin panel, member portal and app screens; services by
    plan, per gym and by the owner (§41); starter membership plans (§45);
    scheduled jobs for EVERY gym; its own owner alerts (never KOM's).

STAGE 8 (mobile app, Capacitor, apps/mobile): BUILT — not yet verified on a
  real phone. Gate: gym search, QR entry and both sign-ins on a real device.
STAGE 9 (QR and deep links, App Links / Universal Links): NOT BUILT.
STAGE 10 (store compliance and release): NOT STARTED — checklist in the
  store-compliance skill; store rules are re-checked then, never from memory.

WAITING ON THE USER:
  Vercel (§45.1): PAYSTACK_SECRET_KEY (test key), PLATFORM_BILLING_LIVE=true,
    PLATFORM_RETENTION_LIVE=true, PLATFORM_PRIVACY_CONTACT=hello@mulesoo.com;
    after reading them, PLATFORM_PRIVACY_APPROVED / PLATFORM_TERMS_APPROVED.
  The Gym Owner Agreement rewrite (§45): the supplier's legal details first.
  COCATE GYM: price a starter plan and switch it on, so members can join.
ON HOLD: §44 — Google and Apple sign-in for owners.
OPEN DECISIONS: WhatsApp on the app's Help screen (§41); /api/document
  session-binding (D-127 option 3); PAR-Q health flags sent through WhatsApp /
  Telegram owner alerts; biometric retention; member identity (§25, §30).
KNOWN LIMITS AT SCALE: the scheduled jobs run gym by gym inside one 60-second
  function; every new gym's schema is appended to PostgREST's exposed list,
  and exposing one reloads it for all gyms (D-097). Both need work well before
  10,000 gyms.
```

The full history of how each stage was built is in the decision log (`vault/18`) and the change
history (`vault/20`), and in §36–§45 below.

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

---

## 40. Main admin panel — corporate level, every tenant gym under its control (user instruction, 2026-09-28)

> The user's words, word for word, from two messages on 2026-09-28. Clarified one question at a
> time in §40.1, which wins over the text above it. Not built until §40.1 is answered.

**Where things are deployed** (the user, 2026-09-28):

> i did not have domain have now that why we running my app on preview so in prodiction its main
> admin pannel for yyo gyms so when we fix issue related with main admin pannel of yoyo gyms we
> deploy on production , when we fixing app side we deploy to preview

Production (`yoyogym.vercel.app`) is the **Yoyo Gyms main admin panel**; the preview branch
(`stage-8-app`) is where the **app** is tested, until a domain exists. Both are the SAME whole
website, so one deploy carries every commit before it. Production caught up with the preview once,
by the user's choice, on 2026-09-28 (`da6b0aa`). From then on: main-admin-panel fixes → production;
app fixes → preview only.

**The instruction:**

> also check be sure that tenants of gyms controlled and managed by production side so search deap
> down what main admin pannel of yoyo gyms button needed to be added what it should include, be
> surthat the register are clearly get approved or suspended, pdf submited to it is open wihout
> issue, corporate lavel admin pannel builted and no dead button or text and track real data admin
> pannel arrangment and connectivity with tenant gym and work, everything must be 10/10

### 40.1 Clarifications — answered by the user, one at a time

Checked against the code AND the live data on 2026-09-28 (read-only, plus one throwaway test file
uploaded to the private document bucket and deleted):

- **Live data:** 1 application (`submitted`, **0 documents**), 1 gym (KOM, active, Prime), all three
  plans priced, 1 Yoyo staff account, 1 owner account.
- **Works, verified:** every link and form target in the panel resolves (36); approve / reject /
  request-information, each permission-checked and audited, and a failed approve says why;
  suspend / reactivate, plan change, owner switch-off, plans and prices, finances, security, audit.
  **A PDF uploaded exactly as the owner page sends it opens for the reviewer**: stored as
  `application/pdf`, served inline, nothing blocks the embedded viewer, bytes identical.
- **F-40.1 — suspending KOM does not lock KOM.** A gym reached WITHOUT its slug (KOM at
  `yoyogym.vercel.app/admin`, `/member`) never consults the registry (`gymcontext.js`: no slug → no
  resolution), so the platform's suspend, and its plan, reach only `/g/kom/`. The Suspend button
  promises "Members and staff will be locked out".
- **F-40.2 — owners see the staff menu.** The owner page uses the staff layout: Today, Applications,
  Gyms, Owners, Plans, Finances, Security, Audit — dead links for an owner (403), and **Today has no
  permission check at all**, so any gym owner sees platform-wide figures.
- **F-40.3 — the reviewer cannot see who applied.** The application page shows gym name, city and
  status only: no owner name, email, chosen plan, expected members or stated needs. The form never
  asks for a phone number or the gym's address.
- **F-40.4 — nothing is required before Approve.** The live waiting application has no documents and
  can be approved as it is. Which documents are required is `[undecided]` (§17, §30).
- **F-40.5 — a rejected owner, or one asked for more, is never told.** `decisionEmail()` is written
  and never called; the owner page shows neither the reason nor the request.
- **F-40.6 — not corporate level.** A 900 px column, a row of nine text links, plain grey status tags
  for every state, inline minimal styling.
- **F-40.7 — no platform-wide activity view.** Members, check-ins and last activity exist per gym
  (counts only, D-130) but only on each gym's own page; the gym list and Today show none of it.
- **F-40.8 — PDFs on a phone.** An embedded PDF is blank in most phone browsers, and the
  "open in a new tab" link only appears where it is not needed.
- **Q1 — the platform controls the gym at the main address too (F-40.1).** Suspend locks KOM's
  staff and members at `yoyogym.vercel.app/admin` and `/member` as well as `/g/kom/`, and KOM's plan
  applies there. If the registry cannot be reached for a moment, the gym keeps working rather than
  locking everyone out (fail open for availability, the registry answer cached as today).
- **Q2 — the application also asks for the owner's phone and the gym's street address (F-40.3)**,
  both required (phone with country code). The reviewer sees everything the owner gave: name,
  email, phone, gym name, address, city, country, plan, expected members and stated needs. Needs two
  new columns on `platform.gym_applications` — SQL given to the user on its own.
- **Q3 — required documents (F-40.4; resolves the §17 / §30 open item "required documents").**
  **ID, business registration and proof of address.** Approve stays unavailable until all three
  are uploaded AND accepted by the reviewer; the page says which are missing. Tax clearance,
  insurance, lease and "other" stay optional.
- **Also found while asking (no question needed, they follow from what exists):**
  **F-40.9** — no way to send an owner a NEW activation link: a lost email or an expired 48-hour link
  leaves an approved gym stuck. A "Send a new activation link" button is added on the gym's page.
  **F-40.10** — six staff roles exist as data (platform owner, admin, reviewer, billing, support,
  read-only) but there is no screen to add a Yoyo staff member; only SQL can. Asked as Q4.
- **Q4 — a Team page (F-40.10).** Only the platform owner sees it. Invite a Yoyo staff member by
  email with a role; they set their password AND authenticator code from a one-time link (2FA stays
  required for staff); change a role; switch someone off. Nobody can remove themselves or the last
  platform owner. Everything audited.

All four answered 2026-09-28. Also built, because they follow from what exists: a **Sign out** link
(the panel had none), a read-only **Platform settings** page (§16) naming every switch and whether it
is set — never a value — and the trial-ending reminders `dashboardPage` already supports but was
never given.

**Built 2026-09-28** — vault D-162 (and D-163, the deployment rule): the platform resolves the gym at
the main address through the registry (suspend and plan apply to KOM everywhere; a registry fault
fails open); a corporate panel — sidebar grouped by job, menu filtered by permission, Sign out,
coloured status labels, number tiles; Today with live figures and recent activity (audit readers
only); the review queue in tabs with search; the application page with the applicant's details, the
three-document checklist and a greyed-out Approve until they are accepted (enforced server-side,
failing closed); decision emails sent, and the reviewer told when one cannot be; an answered request
returns to the queue; the gym list with members, check-ins and last check-in per gym (counts only);
the gym page with its owner, plan limit and "Send a new activation link"; Open and Download on every
document; the Team page with one-time invitations that set a password and an authenticator; a
read-only Settings page; a switched-off staff member loses access on the next click. SQL:
`platform/migrations/2026-09-28-main-admin-panel.sql` (two columns, one table).

---

## 41. Services by plan, toggled per gym, chosen by the owner — and a panel that works end to end (user instruction, 2026-09-28)

> The user's words, word for word, from two messages on 2026-09-28 (the second arrived cut off, as
> shown). Clarified one question at a time in §41.1, which wins over the text above it. Not built
> until §41.1 is answered.

> also inside yoyo gyms admin pannel the control buttons are to small search deap down and add what
> needed to be added be sure that each button track and work properly with each gyms no false data
> track real data it must be 10/10

> also inside yoyo gyms admin pannel add more service that controlled for each members of gyms by
> turning togle on and off based on their plan so main admin can add or mainus as they want so you
> should search deap down what service in adtion yoyo gyms provide for society of gym that can
> attract so depend on plan we provide, also this when turning on and off togle of services listed
> for each gym must shaw during gym owner register and also gym owner must have its own togle on and
> off what service he can provide for his gym member so allow gym owner to write gym services and
> write the plan of gym so that it

> add more to look corporate lavel service yoyo gyms provide

### 41.1 Clarifications — answered by the user, one at a time

Checked against the code on 2026-09-28:
- **Already exists:** a gym owner writes their gym's own membership plans and add-on services in
  their gym admin panel (Catalog → `gym.plans`, `gym.addon_services`), per gym.
- **Already exists:** 19 services ("features", `shared/features.js`) — members, check-in, payments,
  catalog, settings, staff, QR, classes, trainers, messaging, reporting, progress, import/export, face
  recognition, access control, advanced analytics, marketing, referrals, audit. Each Yoyo plan has a
  list of them in `platform_plans.features`, and the gym's API refuses what its plan does not include
  (402, §18.4).
- **Missing:** no screen changes which services a plan includes; no per-gym on/off; no owner on/off
  for their members; the apply page's plan list is written in the code (`platform/plans.js`), not read
  from the live plan settings.
- **Not a service yet:** anything not in that list. A toggle for a service that does not exist would
  be exactly the false data the instruction forbids — new services are built, then toggled.
- **Q1 — the cut-off sentence:** the services and membership plans an owner writes are **shown to
  members** — on the gym's page in the app and on the web — before joining and after.
- **Q2 — what the main admin switches (the user's words: "each gym's services … including plan and
  gym itself"):** BOTH. Each plan (Basic / Medium / Prime) has an on/off switch per service, and each
  gym can have a service added or removed for that gym alone. Claude researches which further
  services Yoyo Gyms should offer, and they become switchable too. **Also asked for:** the gym-owner
  registration page must present the services attractively ("mouth-watering") and carry the terms
  and conditions, so owners are encouraged to register and trust Yoyo Gyms. Every service shown must
  exist — no promise the product does not keep.
- **Q3 — four NEW member services are built** (chosen from research into what keeps gym members:
  loyalty programmes, gamification, flexible holds, family plans): **Rewards and streaks** (points and
  badges for visits; the owner sets rewards claimed at the gym); **Challenges and leaderboard**
  (owner-run challenges; an opt-in leaderboard, first names only); **Pause my membership** (members
  pause from the app within the owner's rules; the end date moves automatically); **Family and group
  memberships** (one payer, several linked members, each with their own card and check-in). Each is a
  service like the existing ones: switchable per plan, per gym, and by the owner.
- **Q4 — where the new services start:** Basic gets Pause my membership; Medium adds Rewards and
  streaks, and Family and group; Prime adds Challenges and leaderboard. All changeable with the
  switches.
- **Q5 — terms at registration:** the registration page shows the key terms of the Gym Owner
  Agreement and requires an "I agree" tick; the agreement stays marked DRAFT until the user (or a
  lawyer) has read the full wording and says to approve it (`PLATFORM_TERMS_APPROVED`). It is
  accepted again at activation, as today.
- **Q6 — what Yoyo Gyms promises owners (the corporate-level list):** everything already true
  (verified listing, the gym's own branded app, each gym's data kept separate and secure, member
  import, QR posters, face check-in, audit trail, 30-day free trial, the owner agreement PDF), PLUS
  three commitments the user's team keeps: **setup help** for every new gym; **support levels by
  plan** (email for all; same-business-day replies for Medium and Prime; a WhatsApp line for Prime);
  a **named account manager for Prime** who checks in monthly.
- **Q7 — the Prime WhatsApp number is added later**, typed by the platform owner on the Settings
  page (so Settings gains an editable "Support contacts" section, stored in the platform database).
  Until a number is saved, Prime owners are shown the support email (hello@mulesoo.com).
- **Q8 — facilities:** besides the priced add-ons they already write, owners tick their gym's free
  facilities (showers, lockers, parking, sauna, Wi-Fi, towels, café, childcare …) and can add their
  own. Shown to members on the gym's page in the app and on the web.

All eight answered 2026-09-28. **The build, in two parts:**
1. **Control** — services as data with three switches: the plan's (main admin, Plans and prices),
   the gym's own additions or removals (main admin, the gym's page), and the owner's on/off for their
   members (gym admin → Settings), which can only switch off what plan and gym allow. The gym's API
   enforces the result; the menus follow it. The registration page presents the services and the
   corporate promises (Q6) with the key terms and a required "I agree" (Q5). Settings gains editable
   support contacts (Q7). Every control button at least 44 px tall. Facilities (Q8).
2. **The four new services** (Q3), each end to end — database, API, gym admin screen, member web
   and app screens — and each behind its switch.
Each part is tested, checked on screen, then deployed to the PREVIEW first (it touches the gym admin
panel and the app, D-163); production when the user says.

**Part 1 built 2026-09-28** — vault D-164: the three switches (plan on the Plans page, one gym on its
page, the owner in their Settings), enforced by the gym's API; the registration page from the live
plans, with what every plan includes, support by plan, the key terms and a required "I agree"; owner
facilities; each gym's plans, add-ons, services and facilities shown to members on the web, in the
portal and in the app; setup help tracked; support contacts editable; every control at least 44 px.
SQL: `platform/migrations/2026-09-28-services.sql`. **Part 2 — the four new services — next.**

**Part 2 built 2026-09-29** — vault D-165: Pause my membership, Rewards and streaks, Challenges and
leaderboard, Family and group memberships — each with its rules, the owner's screen, the member's
screen on the web and in the app, and its switch; points and progress counted from check-ins; the
morning job ends pauses; starting plans per Q4. SQL: `db/migrations/2026-09-29-member-services.sql`
(each existing gym schema) and `platform/migrations/2026-09-29-plan-services.sql`.

---

## 42. Gym-owner application — documents before submit, a review page that opens every document (user instruction, 2026-09-29)

> The user's words, word for word (the pasted error page shortened to its code). Clarified one
> question at a time in §42.1, which wins over the text above it. The new application flow is not
> built until §42.1 is answered.

> during applying to as gym owner it submitted before upload required documents also there no
> button ready to upload those documents, also as main yoyo gyms owner try to approve it does not
> display when i click submited application it says = *[This page doesn't exist … 404 NOT_FOUND]*
> still yester day application is waiting today application also waiting, so what needed to fix is
> there must be each requred document upload box that acces from any device either form of pdf or
> photo, and after uploaded and person must submit after checking that he wrote correctly, yoyo gyms
> admin pannel must open when clicked on it either pdf or picture get download inorder to prevent
> fruad, approving automatically sent link on email to gym owner by provided email during
> regestration for further

### 42.1 Clarifications — answered by the user, one at a time

Checked against the code AND production on 2026-09-29:

- **F-42.1 — the 404 is Vercel's, not the app's** (`X-Vercel-Error: NOT_FOUND`). Outside Next.js a
  catch-all file (`api/platform/[...path].js`) matches ONE path segment only; Vercel's docs say
  splat routes need a rewrite. So every two-part platform address never reached the app on Vercel:
  an application's page and its decision, opening a document, the owner's document upload
  (`/platform/my-gym/documents/request`), a gym's page (suspend, plan, services), and the app's
  gym search and sign-in (`/platform/api/…`). One-part pages (lists, login, apply) work. Local tests
  passed because they call the router directly. The earlier explanation of "the application page
  says fail" (the applicant's own account) was wrong — this was the cause.
- **F-42.2 — an application is submitted with no documents.** By design today the applicant applies
  first and uploads the three documents afterwards from their account page — and that upload is
  behind F-42.1, so nobody could upload.
- **F-42.3 — an iPhone photo can arrive as HEIC**, which Chrome on a Windows computer cannot show,
  so the reviewer could not open it.
- **Already true once F-42.1 is fixed:** the review page shows a PDF in a viewer and a photo as a
  picture, with Open and Download; approving creates the gym and emails the activation link to the
  email given at registration (hardened in `2a16b36`: the token is tried before anything is
  recorded).
- **F-42.1 FIXED and live 2026-09-29** (`1e9bbd4`, `2daae8b`, deployed with the user's approval).
  Two rewrites carry every multi-segment address to the function by its file name; checked on
  production: an application's page and a gym's page go to sign-in (were 404), the app's gym search
  returns KOM, the document upload route answers. First attempt reached the router but missed the
  routes: a `+` in the rewrite's destination came through as a trailing space.
- **Q1 — what a reviewer's click does:** the PDF or photo **opens inside the panel** (full screen on a
  phone too), with a **Download** button to save the original and inspect it closely. Every open and
  download is recorded in the audit log.
- **Q2 — the two applications already waiting with no documents** (SASO GYM, 24 Sept; COCATE GYM,
  29 Sept): both go back to **documents needed** and leave the review queue; each applicant is
  **emailed a link** to sign in, upload the three documents, review and submit.

Both answered 2026-09-29. **The build:** the application becomes three steps on any device — (1) the
details, which create the account and save a draft; (2) one upload box per required document, PDF or
photo, from the phone's camera or files (photos converted on the device so any computer can open
them), plus the optional ones; (3) a review page with everything written and every document, where
Submit stays unavailable until the three are in. A draft is continued by signing in, from any device.
Only a submitted application reaches the review queue.

**Built 2026-09-29** — vault D-166: the three steps (details save a draft and sign the owner in; one upload
box per document, PDF or photo, photos converted on the device; a review page with a required tick), Submit
refused on the server without the three documents, drafts shown to reviewers as "Not sent yet", every
document open and download audited, and the app's JSON twin on the same rule. No SQL.

---

## 43. Activation link limits, and owners signing in from the app (user instruction, 2026-09-29)

> The user's words, word for word. Clarified one question at a time in §43.1, which wins over the text
> above it. Not built until §43.1 is answered.

> the email link sent to ne person one times a day and the email link and activation code must
> expaired after 10 minutes and after activating code and creating pasword for gym the gym owner
> should open hisapp and click as existing app add email that used during regestration and pasword
> created, be sure that that thing works for all gym owners,

> also web app download shaw old single gym sytem fix issue ,

### 43.1 Clarifications — answered by the user, one at a time

Checked against the code on 2026-09-29:
- **Today an activation link and code last 48 hours** (`ACTIVATION_TTL_HOURS`), and a new one can be sent
  any number of times, by Yoyo staff only ("Send a new activation link" on the gym's page). Approving
  sends the first one automatically.
- **Today the app's owner sign-in is:** I'm a Gym Owner → Owner login → **search for and pick the gym** →
  that gym's sign-in (email or username + password) — as decided in §36.1 Q2.
- **The first real owner (COCATE GYM) activated at 09:52 and was then refused**: the sign-in reached the
  right account and the password did not match. Most likely the browser filled in the password saved at
  application (not proven). Fixed in `182f03d`: a "Forgot your password?" on the gym sign-in (owners reset
  by email; it sets the Yoyo account and the gym sign-in together), and the activation page now makes the
  browser replace its saved password.
- **The installed web app is the old single-gym one** (`public/manifest.webmanifest`): named "Gym
  Membership" / "My Gym", and it opens `/member` — on the main address that is KOM's member sign-in,
  whichever gym it was installed from. The service worker is network-first, so it is not serving an old
  copy; the install settings themselves are the old ones.
- **Q1 — activation link limits:** a link and code **expire 10 minutes** after they are sent, and a person
  receives **at most one a day**. An owner who misses the 10 minutes asks for the next link themselves on
  the expired-link page, and it can be sent only once the day's link is used up (24 hours after the last);
  Yoyo staff cannot send extras either. The approval email counts as that day's link.
- **Q2 — owners sign in from the app with email + password only.** The owner enters the email they applied
  with and their password; the app finds their gym and opens its admin panel — no searching for the gym
  first. Staff (manager, reception, trainer) still choose the gym first: they have no Yoyo account.
  *This revises §36.1 Q2 for owners only.*
- **Q3 — no web app.** In the user's words: *"the app must be native app no web app should downloaded, so
  its known how androaid app and apple app supposed to look"*. The website stops offering itself as an
  installable app (no install manifest, no home-screen app mode); the only app is the Android and iPhone
  store app. *This reverses the part of D-038 (§15) that kept the PWA as the gym's web surface* — the
  website pages themselves stay, in the browser and inside the store app.

All three answered 2026-09-29. **The build:** activation links that expire in 10 minutes, one per person
per day, re-requested by the owner from the expired page; the app's owner sign-in by email + password
alone, landing in their own gym's admin panel (staff keep choosing the gym); the website no longer
installable. Tested for any gym owner, not only COCATE.

**Built 2026-09-29** — vault D-168: activation links and codes expire in 10 minutes; one link per person per
24 hours, whoever asks (the approval, a Yoyo staff resend — refused with the wait, without killing the
current link — or the owner's "Send me a new link" on the expired page); owners sign in with email +
password at `/owner/login` (the app's Owner login, and the website's), the password checked by their own
gym, and land in its admin panel; staff keep "Gym staff sign in" → choose the gym; the website has no
install manifest, and a browser that installed the old web app has its service worker removed. No SQL.

---

## 44. Gym owners may sign in with Google or Apple as well as a password (user instruction, 2026-09-29)

> The user's words, word for word. Clarified one question at a time in §44.1, which wins over the text
> above it. Not built until §44.1 is answered.

> also hear addtional improvement for option, one thing after the link sent person activate by
> verfication code give option to create pasword how it work in addtion if person can create account
> with google or apple account and when person click one of them it must create automatically, next
> time gym owner whant to login he can logn the option h choosed , may be email and pasword, google
> account and apple account be sure that in any cause the only one profile account created and main
> admin pannel record

### 44.1 Clarifications — answered by the user, one at a time

Checked against the code and the rules on 2026-09-29:
- **Today an owner has one Yoyo account** (email + password, `platform.platform_users`) **and one account
  inside their gym** (username `owner` + password). Since §43 the owner signs in to the gym with email +
  password alone, checked by the gym.
- **Google sign-in needs a Google Cloud sign-in client** (free), created by the user in their Google
  account; **Apple sign-in needs the paid Apple Developer Program** (99 USD a year) and a sign-in key.
  Neither exists yet, and neither can be created on the user's behalf.
- **App Store rule (Guideline 4.8):** an iPhone app offering Google sign-in must also offer Sign in with
  Apple, or an equivalent. So Google alone would be refused at the iPhone app's review.
- **One profile per person** is possible whichever way they sign in: Google or Apple is LINKED to the
  owner's existing account at activation (the activation link already proves which account it is), so
  a different email at Google, or Apple's "hide my email" address, still lands on the same profile.
- CLAUDE.md §20 already allows Google and Apple as future methods, and says existing members are not
  moved to them; this instruction is about gym owners.
- **Q1 — Google first, Apple later.** Both are built; Google is switched on for the website and Android as soon
  as the user creates the Google sign-in client; the iPhone app offers both once the Apple Developer account
  exists (App Store rule 4.8). Claude gives step-by-step setup instructions for each.
  **Found while checking:** Google refuses its sign-in inside an app's embedded web view, so in the app
  "Continue with Google" must be the phone's own Google sign-in, not the website's button.
- **Q2 — several ways in, one profile.** An owner can add Google or Apple later from their account page, and
  remove one as long as another is left; every way opens the same single profile. The main admin panel
  shows which ways each owner uses, and every link and unlink is in the audit log.
- **Follows from Q1–Q2 (no question needed):** a profile is only ever CREATED by applying. Google or Apple is
  linked to it at activation or from the account page; signing in with a Google or Apple account that is
  not linked is accepted only when that provider has verified the SAME email as the owner's profile (then
  it is linked, once), and is otherwise refused — never a second profile. The gym still decides who gets
  in: the owner's own account in their gym issues the session.

---

## 45. A new gym's features, its sign-ups, and a fully green platform Settings page (user instruction, 2026-09-29)

> The user's words, word for word. Clarified one question at a time in §45.1, which wins over the text
> above it. §44 (Google sign-in) is ON HOLD at the user's word.

> hold on google sign in now we will back for it, i sucesfull login after change pasword in email link
> sent and open owner admin pannel and sme fetures are locked its not like another kom gym so all feture
> must be available depend on their plan, so when i try to register as memberit says not talking
> signups yet, also yoyo gyms admin pannel shawing some fetures still not ready, look setting on yoyo
> gyms admin pannel setting and fix all issue make all of them grean

### 45.1 Clarifications — answered by the user, one at a time

Checked against the code and the live data on 2026-09-29 (read-only):
- **The locks are the plan, exactly.** COCATE GYM is on **Medium** (16 of 23 services); KOM is on **Prime**
  (23). COCATE's locked services are precisely the seven Prime-only ones: face recognition, door access
  control, advanced analytics, marketing, referrals, the gym audit log, challenges. The admin panel's
  menu reads the same list the server enforces. To unlock them: move COCATE to Prime (main admin panel →
  its gym page → Plan), or add a service for that gym alone (its Services switches).
- **Sign-ups are closed because COCATE has no membership plans** (its catalog is empty; KOM has 9 plans
  and 10 add-ons, set up by hand before the platform existed). A gym cannot take a member without a plan
  to sell. The waiver, contract and privacy texts are fine: a gym without its own gets the built-in ones.
- **The platform nightly job never runs.** "Nightly job: set" checks only that its secret exists; nothing
  calls it (it is not a Vercel cron, `platform/CRON.md`), so billing, the drift report and document
  retention would never happen even when switched on.
- **What each amber line needs** (Vercel → Settings → Environment Variables, Production, then redeploy):
  Billing gyms `PLATFORM_BILLING_LIVE=true` · Card payments `PAYSTACK_SECRET_KEY` (from the user's Paystack
  account) · Deleting old documents `PLATFORM_RETENTION_LIVE=true` · Privacy policy
  `PLATFORM_PRIVACY_APPROVED=true` · Privacy contact `PLATFORM_PRIVACY_CONTACT=<an email>` · Gym Owner
  Agreement `PLATFORM_TERMS_APPROVED=true`. These are the user's keys and decisions; Claude cannot set them.
- **Q1 — every new gym starts with STARTER membership plans, switched off, with no price** — Monthly,
  3 months, 12 months and a Day pass. The owner types their prices and switches them on in Catalog; sign-ups
  open the moment one is on. No invented price ever reaches a member. COCATE GYM gets them too.
- **Q2 — billing in TEST mode first:** Paystack's test secret key (`sk_test_…`) and
  `PLATFORM_BILLING_LIVE=true`; checked end to end with no real money; then the live key replaces it.
- **Q3 — the legal texts:** the user reads `/platform/privacy` and `/platform/terms` first, then sets
  `PLATFORM_PRIVACY_APPROVED=true` and `PLATFORM_TERMS_APPROVED=true` themselves.
- **Q4 — privacy contact:** `PLATFORM_PRIVACY_CONTACT=hello@mulesoo.com`.
- **Q5 — delete old documents:** `PLATFORM_RETENTION_LIVE=true` — a rejected applicant's documents are
  deleted when the retention period ends; an approved gym's are kept while it trades.

**Built 2026-09-29** — vault D-169: new gyms get two starter plans (Monthly membership, Day Pass), off
and unpriced, only into an empty catalog (COCATE given them); a plan cannot be switched on without the
price its kind is sold at, and the public catalog never lists one; the owner's Catalog screen offers
the right price box per kind (it only had "Monthly price", and turned a blank into R0) and shows a
refusal in the form; the platform nightly job now runs from the 06:00 daily job (production only),
records each run, and "Nightly job" is green only when it ran in the last 36 hours. The amber lines
that need the user's keys and decisions are listed in Q2–Q5.

> Added mid-build (the user, 2026-09-29): *"search detail what needed to be added on term and condtion
> clearly explains"* — researched the same day against POPIA ss 19–21, 26–27 (operator contract, security,
> special personal information), ECTA s 43 (what an online supplier must disclose) and common B2B SaaS
> terms. The current Gym Owner Agreement (8 short sections, version 2026-09-24) lacks: the supplier's legal
> details, a proper operator (data-processing) clause, breach notification, sub-processors and cross-border
> transfer, special personal information (health, biometrics), the owner's own duties, acceptable use,
> suspension causes, data export on exit, intellectual property, confidentiality, service levels and
> support, liability and indemnity, price changes and taxes, governing law and disputes, notices and
> general terms. The rewrite waits for the user's decisions (company details first); it stays DRAFT.

---

## 46. Production security, performance and store-readiness audit (user instruction, 2026-09-30)

> The user's words, word for word ("before i test and we build hear what you should do"), followed by
> the brief they pasted. Clarified one question at a time in §46.1, which wins over the text above it.
> Findings are checked against the code, never assumed; store rules are checked against the official
> store documentation, never from memory (§19).

> Act as a Principal Software Engineer and Mobile Security Expert. I am preparing to launch my
> application to production (targeting iOS App Store and Google Play Store).
>
> Please perform a comprehensive security, performance, and app store readiness audit on this entire
> codebase, and write the necessary fixes and code updates.
>
> Focus specifically on these critical areas:
>
> 1. SECURITY & ANTI-HIJACKING
> - Scan for hardcoded secrets, API keys, credentials, or private URLs, and move them to environment
>   variables (.env). Ensure .env is added to .gitignore.
> - Review all API endpoints to ensure Parameterized Queries or ORM methods are used exclusively to
>   prevent SQL Injection (SQLi).
> - Verify Object-Level Authorization (BOLA/IDOR): ensure every database query checks resource
>   ownership (e.g., WHERE user_id = authenticated_user.id).
> - Audit token/session storage: ensure auth tokens (JWTs) are stored in HttpOnly, Secure cookies or
>   native OS secure storage (Keychain/KeyStore), NEVER in raw localStorage or AsyncStorage.
> - Audit third-party dependencies for known vulnerabilities or suspicious imports.
>
> 2. RATE LIMITING, RESILIENCE & DENIAL-OF-SERVICE (DoS)
> - Implement or verify global and route-specific API rate limiting (e.g., using Redis or middleware)
>   to prevent single users or bots from spamming the API.
> - Ensure database connection pooling and query timeouts are configured.
> - Enforce strict JSON payload size limits (e.g., max 1MB) on incoming requests.
>
> 3. APP STORE COMPLIANCE (iOS & Android)
> - Audit AI features: ensure AI outputs are disclaimed, sanitized, and that a user mechanism to
>   report or block inappropriate content exists.
> - Account Control: verify there is a working in-app path for users to delete their account and
>   associated data.
> - Monetization: ensure digital purchases or subscriptions rely on native store payment mechanisms
>   (Apple IAP / Google Play Billing).
> - Social Logins: if Google/Facebook login exists, confirm Sign in with Apple is implemented for iOS
>   compatibility.
>
> 4. ERROR HANDLING & TELEMETRY
> - Ensure sensitive PII, passwords, or raw stack traces are never logged to output or sent to
>   user-facing error UI.
> - Implement clean, graceful UI fallbacks for failed network calls or server errors.
>
> Please analyze the codebase against these criteria, list any vulnerabilities or missing
> requirements found, and provide step-by-step code modifications or pull requests to fix them.

### 46.1 Clarifications — answered by the user, one at a time

Checked against the code on 2026-09-30:
- **Already sound:** no secret in the code (`.env` is git-ignored; only `.env.example` is tracked); every
  query goes through the supabase-js query builder, which parameterises values — no SQL is built from
  input; each gym's data is in its own schema, a member's own endpoints use the id in their token, and
  the owner pages check ownership (F-3); Yoyo staff sessions are HttpOnly cookies; sign-in,
  registration and documents have their own rate limits; the app handles offline and failed calls
  with plain messages. **No AI features** exist (face check-in is matching, not generated content).
  **No social login** exists — §44 is on hold, and §44.1 Q1 already requires Sign in with Apple
  with Google on the iPhone.
- **Fixed (`ee7c022`), no decision needed:** F-46.1 — 55 handlers sent the database's own error text
  to the browser (table and column names, sometimes the clashing value); now a plain sentence, the
  cause logged with values masked. F-46.2 — four gym admin lookups put typed text inside a PostgREST
  filter string; now cleaned first. F-46.3 — no limit on request size; now 1 MB (4 MB for face
  photos, logos and member imports). F-46.4 — no general rate limit; now 300 requests a minute per
  address per server instance. F-46.5 — no deadline on database calls; now 15 seconds. F-46.6 —
  dependency security updates that break nothing.
- **Needs the user's decision:** F-46.7 — session tokens: the app keeps the member's sign-in in its
  web storage, and the gym admin panel and member web pages keep theirs in the browser's
  localStorage (readable by any script that runs on the page). F-46.8 — the stricter rate limits
  are shared between server instances only with Upstash (`UPSTASH_REDIS_REST_URL/TOKEN`). F-46.9 —
  account deletion: a member can only REQUEST deletion (the gym erases by hand) and an owner can
  only ask to close their account. F-46.10 — owners pay the Yoyo subscription with Paystack on the
  website, and the owner area opens inside the app. F-46.11 — two upgrades are major versions: Vite
  8 (a build tool; its issues touch only the development server) and React Router 7 (a moderate
  redirect issue; our redirects are already checked).
- **Q1 — sessions (F-46.7): both, fully.** In the app, the member's sign-in moves to the phone's secure
  storage (iPhone Keychain, Android Keystore) through one new app plugin; the app is rebuilt. On the
  website, the gym admin panel and the member pages keep their sessions in HttpOnly, Secure cookies,
  with CSRF protection on every change. A deliberate change to the protected sign-in (§32); everyone
  signs in once more.
- **Q2 — shared rate limits (F-46.8): yes.** The user creates a free Upstash Redis database and sets
  `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in Vercel; the limits switch to it by
  themselves. The platform Settings page shows whether they are set.
- **Store rules, checked 2026-09-30 from the official pages** (Apple: Offering account deletion in your
  app; App Store Review Guidelines 3.1.1, 3.1.1(a), 3.1.3(a)–(f), 5.1.1(v). Google Play: Understanding
  account deletion requirements (answer 13327111); Payments policy (answer 9858738)):
  **Deletion** — Apple: an app that supports account creation must let people START deletion inside
  the app; a manual process is acceptable if the person is told how long it takes and is confirmed
  when it is done; no phone, email or support steps outside highly regulated industries; all personal
  data is deleted except what the law requires, and people are told. Google: an in-app path AND a web
  link; data kept for security, fraud or legal reasons is allowed if the privacy policy says so.
  **Payments** — a gym membership is a physical service: Apple 3.1.3(e) forbids in-app purchase for
  it, and Google names "gym memberships" as exempt from Play Billing. The OWNER's Yoyo subscription
  is software: Google requires Play Billing for "cloud software and services" and forbids leading
  users to any other payment method "in-app promotions, webviews, buttons, links, messaging … sign-up
  flows"; Apple forbids buttons or links to other purchase methods in the app outside the US storefront
  (3.1.1(a)), and 3.1.3(c) (enterprise) and 3.1.3(f) (free companion to a paid web tool) allow no
  purchasing or calls to action inside the app.
- **Q3 — account deletion (F-46.9): in the app, finished within 30 days.** A member taps "Delete my
  account" in the app (and on the web link) and is told it is finished within 30 days; the gym sees the
  request in its admin panel and can erase at once; if nothing has happened by day 30, the nightly job
  erases it. Records the law requires (payments) are kept without the name, as the privacy policy says.
  A confirmation email when it is done, where there is an email. Owners the same, handled by Yoyo staff.
- **Q4 — payments in the app (F-46.10): none.** Inside the store app, owners never see prices, Pay
  buttons or payment links for the Yoyo subscription — only their status (trial, active, suspended).
  Paying stays on the website, in the phone's browser; applying to join opens the website outside the
  app. Members are not affected: they pay their gym in person (a physical service, allowed by both).
- **Q5 — major upgrades (F-46.11): both now.** React Router 7 and Vite 8, then every page tested and the
  site rebuilt.

All five answered 2026-09-30. **The build, one part at a time, each tested and committed:** (1) the two
upgrades; (2) no payment in the app — the app's web view identifies itself, and owner pages hide prices,
Pay buttons and payment links there; applying opens the browser; (3) deletion in the app within 30 days
— the member's own button, the gym's list, the nightly job at day 30, the confirmation email, the same
for owners through Yoyo staff (SQL for a deletion date, given to the user on its own); (4) sessions —
secure storage in the app, HttpOnly cookies with CSRF protection on the website; (5) the Settings line
for Upstash, with setup steps for the user.

**Built 2026-09-30** — vault D-171 (`ee7c022`, `e4afb7d`, `0fba260`, `9f43a42`, `b482790` and the Settings
line): the safe fixes; React Router 7 and Vite 8 (no known vulnerability left in the website's
dependencies); no payment for the subscription inside the store app; "Delete my account" / "Close my
account" finished within 30 days; website sessions in HttpOnly cookies with CSRF protection, the app's
in the Keychain / Keystore; the Upstash line on Settings. SQL for the user: the deletion date in each gym
schema, the closing date on the platform. The app needs a rebuild for the two new plugins and its user
agent mark.

---

## 47. Before the app build — each gym's look, colour, sign-ups, sign-out and KOM (user instruction, 2026-09-30)

> The user's words, word for word, from two messages. Clarified one question at a time in §47.1, which
> wins over the text above it. The user stopped the build once the same day ("do not build do not change
> anything just stop ok, reverse to whre it was" — everything was reverted), then resumed it: *"we going
> still not toach chatboat steps so finish it and pus"*.

> before you build app let me tell you what is not going well , when each gym put their poster or logo
> the system must display it as profetional not half not big, also when gym change their colour in
> setting the colour must apply on app but it still keep yoyo orginal colour, what i did not tested is
> payment how cann i check the payment link is working perfectly or not, also on COCATE gym when member
> try to register it says it not started yet check plan , so all plans of yoyo gyms provide has allow
> member of each gym to regester regardles of their plan, also when we try to log out and and want to
> sign up it must display new app of yoyo gyms not loged out gym app and colour,in KOM gyms it desplay
> old stracture either person login or before regester so kom gym must look like the some like another
> gym and no carrie old ugly mention before sign in

> in addtion check be sure that yoyo gyms plan sercide all writen are really provide by yoyo gyms if its
> not add togle to new plan that mentioned but not on yoyo gyms setting, be sure that yoyo gyms manage
> all those service by on and off togle a

### 47.1 Clarifications — answered by the user, one at a time

Checked against the code and the live site on 2026-09-30:
- **COCATE's sign-ups are closed by its own catalog, not its Yoyo plan:** its two starter plans are off and
  unpriced (§45.1 Q1). Member registration is core in every Yoyo plan.
- **The gym colour is a free-text box in Settings:** a typo is dropped silently and the app shows the
  Yoyo lime. COCATE has no colour saved. The phone app on the user's desktop is also an OLD build.
- **After signing out, the app stays on the gym's sign-in screen, in the gym's colours.**
- **Promises on the plans with no switch:** support by plan and the list of what every plan includes.
- **Q1 — a gym with no priced plan still takes members** (register; "plan chosen at the gym"; staff choose
  it at the first payment). **NOT BUILT:** it lives in the chatbot registration steps, which the user has
  said not to touch. COCATE opens sign-ups the moment its owner prices a plan in Catalog.
- **Q2 — KOM looks like every other gym:** the same screens and layout for every gym; a gym's plans appear
  once priced; KOM keeps its nine real plans; KOM's old saved welcome message and tagline are cleared.
- **Q3 — pictures: the whole poster, a neat logo.** The poster is always shown whole, never cropped — its
  own blurred colours fill the rest of the screen, a dark veil keeps words readable; on a computer it sits
  in a phone-width panel. The logo always sits in the same rounded light tile, fitted inside with a
  margin, one size per place, never stretched or cut. In the app and on the website.
- **Q4 — what a person at Yoyo delivers becomes a switch on each plan:** setup help, help moving your
  members, email support, same-day replies, a WhatsApp line, a named account manager — and the free-trial
  length, a number per plan. Facts built into the software (verified listing, the gym's branded app, data
  kept apart, members' privacy, QR posters, the signed agreement) stay fixed statements.
- **No question needed:** signing out of the app returns to the Yoyo front page; the gym colour in Settings
  becomes a colour picker the server checks; payment testing is explained to the user (Paystack test mode).

**Built 2026-09-30** — vault D-172: signing out of the app (and deleting the account) returns to the Yoyo
front page; the gym colour is a picker with a preview, refused by the server unless it is a real colour;
KOM's old welcome message and tagline cleared (only those two keys); the poster shown whole — its own
blurred colours around it, a veil for the words, phone-width on a computer — in the app, on the gym's web
pages and in the admin sidebar; every logo in one light tile; what a person at Yoyo delivers and the free
trial are switches on each plan (Plans page), read by the apply, welcome and owner pages and by the trial
itself; the app's owner screen names only facts no switch can change. Not built: Q1 (chatbot steps).
SQL for the user: `platform/migrations/2026-09-30-plan-promises.sql`.
