---
aliases: ["Existing Yoyo Gym Audit", "Single-Gym Audit"]
tags: [audit, existing-system, source-of-truth]
stage: "Stage 2"
status: complete
audited: 2026-09-21
commit: c68c8c9
---

# 01 — Existing Yoyo Gym Audit

The complete, evidence-based record of the **existing single-gym Yoyo Gym system** as it stands at
commit `c68c8c9`. This note is the factual foundation for [[04 - Yoyo Gyms Platform]] and every
decision in [[18 - Decision Log]]. It describes **what is**, not what should be.

> **Status of the earlier audit.** A previous Claude Code discovery result was searched for in the
> repository, this vault, git history (added *and* deleted files) and the user's home directory. It
> does not exist. On 2026-09-21 the user declared it **permanently absent**. This note replaces it
> and is now the source of truth for existing-system behaviour, per `CLAUDE.md` §29.

## Method and evidence

Every statement below was read from the repository on 2026-09-21. Nothing is drawn from memory,
chat history or the stale `session-progress.md` build log.

Evidence used:

- `db/schema.sql` (568 lines) and the 13 files in `db/migrations/`
- All 6 API routers in `api/**/[...path].js`
- All 76 handlers under `server/handlers/{admin,member,public,auth,payments,cron}/`
- All 26 libraries under `server/lib/` and `src/lib/`
- `src/App.jsx`, `src/pages/**`, `src/chatbot/**`, `src/components/ProtectedRoute.jsx`
- `package.json`, `vercel.json`, `.env.example`, `public/manifest.webmanifest`, `public/sw.js`
- `npm test` executed: **42 tests, 42 pass, 0 fail**

Confidence markers used throughout: **[C]** confirmed in code · **[P]** partial · **[?]** unclear.

---

## 1. Identity and stack

Package name `premium-ai-gym-system`; product "Yoyo GYM"; agency MuleSoo Digital Solutions. **[C]**

| Layer | Technology | Evidence |
|---|---|---|
| Frontend | React 18, Vite 5, Tailwind 3, React Router 6 | `package.json` |
| API | Vercel serverless, 6 routers only | `api/**/[...path].js` |
| Logic | Plain ES modules outside `api/` | `server/**` |
| Database | Supabase PostgreSQL, schema `gym` | `server/lib/supabase.js` |
| Auth | `jsonwebtoken` + `bcryptjs` | `server/lib/auth.js` |
| Payments | Paystack (ZAR) | `server/lib/paystack.js` |
| Email | Brevo | `server/lib/notify/channels.js` |
| Owner alerts | CallMeBot WhatsApp + Telegram | same |
| PDFs | jsPDF, generated **client-side** | `src/lib/pdf/`, `src/lib/*Pdf.js` |
| QR | `qrcode` (generate), `jsqr` (scan) | `src/lib/scan.js`, `QrCodes.jsx` |
| Face | `@vladmandic/face-api` in-browser | `src/lib/face/` |

Logic deliberately lives outside `api/` so only **6 files** count as Serverless Functions against
the Vercel plan limit — an architectural constraint, not an accident. **[C]** (`api/[...path].js:1-3`)

## 2. Tenancy as it exists today

```text
One Vercel deployment + One Supabase project + One env-var set = One gym
```

`db/schema.sql` states this outright: *"the repeatable schema used to stand up a NEW gym tenant
(one Supabase project per gym)"*. There is **no `gym_id` or `tenant_id` column anywhere**. **[C]**

Gym identity lives entirely in environment variables: `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SCHEMA`, `JWT_SECRET`, Paystack keys, Brevo config,
`OWNER_EMAIL`, CallMeBot keys. **[C]** (`.env.example`)

Consequence for the platform: gym identity is currently **implicit in the deployment's domain**.
Carried to [[06 - Tenant Architecture]] — not decided here.

## 3. Database

**24 tables**, all in schema `gym`, all with RLS **enabled and zero policies** (default-deny to
anon/authenticated roles; the server bypasses RLS with the service-role key). **[C]**

Every table created by a migration also appears in `schema.sql` — the schema file is complete.

### Entity relationships (foreign keys, verified)

```text
members ─┬─< memberships ──> plans
         ├─< parq_responses
         ├─< member_addons ──> addon_services, memberships
         ├─< payments ──> memberships
         ├─< checkins ──> admin_users (verified_by)
         ├─< class_bookings ──> classes ──> trainers
         ├─< training_sessions ──> trainers
         ├─< progress_entries
         ├─< referrals (referrer_member_id)
         ├─< admin_inbox (self-referencing parent_id = threads)
         ├─< notifications_log
         └─< incidents ──> admin_users

admin_users ──> trainers (trainer_id)           # a trainer login links to a trainer profile
admin_users ─< announcements, settings, events, visitors, audit_log   (created_by/updated_by/admin_id)
```

Deletion semantics: member-owned rows **cascade** on member delete (POPIA right to erasure);
staff references **set null** to preserve history. **[C]** (`db/schema.sql:198-534`)

### Table inventory

`admin_users` · `trainers` · `plans` · `addon_services` · `members` · `memberships` ·
`parq_responses` · `member_addons` · `payments` · `checkins` · `classes` · `class_bookings` ·
`training_sessions` · `notifications_log` · `admin_inbox` · `progress_entries` · `referrals` ·
`announcements` · `settings` · `qr_scan_analytics` · `events` · `visitors` · `incidents` ·
`audit_log`

### Notable columns

- `members.membership_number` — `unique`, format `GYM-YYYY-XXXXXX` **within this gym's database**
- `members.verification_code` — `unique`, 8 chars, doubles as a document-access secret
- `members.face_descriptor` / `face_templates` — face-api 128-D, `jsonb`
- `members.arcface_embedding` / `arcface_templates` — ArcFace 512-D, `jsonb`, **currently unused**
- `members.popia_consent_at`, `guardian_consent`, `parq_flag` — compliance fields
- `members.nationality`, `residence_country`, `display_currency` — international support

**No object storage is used.** Photos are a `photo_url` text column; biometric templates are
`jsonb` rows inside Postgres. **[C]** — a material cost/privacy factor for
[[12 - Database Architecture]].

## 4. Member registration — complete flow

Entry: `/register` (or `/register?src=qr`) → `src/pages/Register.jsx` → the scripted chatbot in
`src/chatbot/` → `POST /api/register`.

The conversation is **rule-based, not AI**. `src/chatbot/messages.js:1-6` documents an explicit
"AI-UPGRADE SEAM": messages are hardcoded strings today, and an `ANTHROPIC_API_KEY` endpoint could
later rewrite them without changing the flow. **[C]**

`src/chatbot/flow.js` defines **38 steps** (some conditional), in order: **[C]**

1. `welcome`
2. Identity — `full_name`, `nationality`, `residence_country`, `date_of_birth`, `gender`
3. ID — `id_number` *or* `passport_number` (branches on nationality)
4. Contact — `phone`, `email`
5. Address — `address_street`, `address_suburb`, `address_city`, `address_postal_code`
6. Emergency — `emergency_name`, `emergency_phone`
7. `face_capture` (optional biometric enrolment)
8. PAR-Q — `parq_intro`, `q1_heart_condition` … `q7_other_reason`, `parq_result`
9. Goals — `fitness_goals`, `experience_level`, `training_frequency`, `preferred_time`, `injuries_notes`
10. Commercial — `membership`, `addons`, `has_medical_aid`, `medical_aid_provider` (or `_intl`)
11. `summary`, then `agreement` (indemnity + contract + signature)

Payment and confirmation are rendered by `PaymentScreen.jsx` and `SuccessScreen.jsx`.

### Server behaviour — `server/handlers/public/register.js`

- Rate limited: **6 requests / 60s** per key `register`
- Re-validates server-side: two-word name; DOB present and **age ≥ 16**; email shape; phone
  `+` and 10–15 digits; plan selected; **both agreements accepted and signed**
- **Recomputes all pricing from the database** — client amounts are never trusted; the plan must
  exist and be `is_enabled`
- Generates `membership_number` (`GYM-YYYY-XXXXXX`) and an 8-char `verification_code` using
  `node:crypto` `randomInt`, retrying until unique **[C]** (`server/lib/identifiers.js`)
- Writes `members`, `memberships`, `parq_responses`, `member_addons`
- Optional face enrolment; stores ArcFace vectors **only if** the face service is configured
- Sets member `status = 'new'` (awaiting activation)
- Fires member + owner notifications via `onNewMember()`

Registration is also available to staff at `/admin/register-member`
(`ManualRegister.jsx`), which sets `manually_registered = true`. **[C]**

## 5. Existing member login and portal

**Credentials: `membership_number` + `phone`.** There is no member password and no member email
login. **[C]** (`server/handlers/member/login.js`)

- Phone compared via `normalizePhone()`, not raw string equality
- Success issues a **12-hour** JWT with `audience: 'member'` — a different audience from admin
  tokens, so the two token types cannot be substituted **[C]** (`server/lib/memberauth.js`)
- Rate limited 10 / 60s
- Generic failure message; does not reveal whether the membership number exists

**Alternative: face sign-in** — `POST /api/member/face-login`, accepts `{ image }` (ArcFace path)
or `{ descriptor }` (legacy face-api path). **[C]**

Member portal `/member` (`MemberPortal.jsx`) has **6 tabs**: Status, Check-in, Classes, Progress,
History, Contact. **[C]**

18 member endpoints exist: `login`, `face-login`, `status`, `checkin`, `classes`, `book-class`,
`cancel-booking`, `history`, `request-deletion`, `pay`, `message`, `messages`,
`request-plan-change`, `profile`, `announcements`, `progress`, `refer`, `enroll-face`. **[C]**

Notable member rules: check-in blocks when the membership is not active and prevents duplicates;
class booking enforces **tier eligibility and capacity**, with waitlisting; cancellations under
**2 hours' notice are flagged**; `request-plan-change` explicitly **does not change billing** —
the owner approves, members never self-bill. **[C]**

## 6. Admin and owner login

`POST /api/auth/login` with `{ username, password }`. **[C]**

- bcrypt verification (`BCRYPT_ROUNDS`, default 12)
- **Generic error** `Invalid username or password` — never reveals username existence
- Disabled accounts rejected with a distinct message
- **5 failed attempts → 15-minute lock** (`locked_until`), counter reset on success
- **8-hour** JWT carrying `sub`, `username`, `role`, `full_name`, `trainer_id`
- Rate limited 10 / 60s
- Also: `GET /api/auth/me` (revalidates against the live record),
  `POST /api/auth/change-password` (self-service, verifies current password),
  `POST /api/auth/face-login` (admin face gate)

Frontend guard `src/components/ProtectedRoute.jsx`: unauthenticated → `/admin/login`;
wrong role → redirected to that role's home. **This is UX only — real enforcement is server-side**
via `requireRole()` in every handler. **[C]**

## 7. Roles and permissions

Four roles: `owner`, `manager`, `reception`, `trainer`. **[C]** (`server/lib/auth.js`)

Server-side role guards, verified handler by handler:

| Scope | Roles allowed | Handlers |
|---|---|---|
| **Owner only** | `owner` | `settings`, `staff` |
| Management | `owner`, `manager` | `dashboard`, `members`, `member`, `payments`, `analytics`, `broadcast`, `plans`, `addons`, `classes`, `class-bookings`, `trainers`, `events`, `audit`, `finance`, `notifications`, `inbox`, `announcements`, `members-import`, `qr-stats`, `attendance-report` |
| Front desk | `owner`, `manager`, `reception` | `verify`, `today`, `visitor`, `incident`, `resolve-member`, `access-card`, `access-action`, `attendance-live`, `face-descriptors` |
| Trainer-inclusive | `owner`, `manager`, `trainer` | `clients`, `training-session` |
| Any staff | all four | `message` |

`clients` additionally scopes results: **trainers see only their own sessions**; owner/manager see
all. **[C]** Managers have full access *except* settings and staff — matching the v1 spec. **[C]**

## 8. Admin panel — routes and capabilities

**23 role-guarded routes plus an unguarded `/admin/login`** (`src/App.jsx`), served by
**37 admin API routes**. **[C]**

| Route | Page | Capability (from handler) | Roles |
|---|---|---|---|
| `/admin` | Dashboard | At-a-glance metrics, outstanding + unread tiles, deep links into filtered queues | mgr |
| `/admin/verify` | VerifyScreen | Access decision from verification code **or** membership number; auto-logs check-in for active members | recep |
| `/admin/scan` | FaceScan | Biometric turnstile; matches against cached face galleries | recep |
| `/admin/attendance` | Attendance | Live floor status + today's board, polled ~30s | recep |
| `/admin/visitors` | Visitors | Day passes for guests | recep |
| `/admin/incidents` | Incidents | Security incident log + owner alert | recep |
| `/admin/members` | MembersList | Search/filter by `q`, `status`, `tier`, `parq`, paginated; CSV import; CSV export | mgr |
| `/admin/members/:id` | MemberDetail | 360 view: profile, bookings, incidents, activity log, receipts; quick actions (check-in, regenerate code, status) | mgr |
| `/admin/today` | TodayOverview | Today's check-ins, who is inside, class schedule with booking counts | recep |
| `/admin/classes` | ClassManagement | Class CRUD + bookings, waitlist promote, attended / no-show marking | mgr |
| `/admin/trainers` | TrainerManagement | Trainer CRUD, credentials, ID cards | mgr |
| `/admin/payments` | PaymentsAdmin | Payment list + breakdown, manual cash/EFT capture, AR aging, dunning, receipts | mgr |
| `/admin/analytics` | Analytics | 30-day check-ins, tier mix, medical-aid split, new vs lapsed, 6-month revenue, peak hours, churn; board PDF | mgr |
| `/admin/calendar` | CalendarAdmin | Events and blocked days | mgr |
| `/admin/communications` | Communications | Compose/History tabs, bulk email by filter, templates, announcements | mgr |
| `/admin/register-member` | ManualRegister | Staff-side member registration | recep |
| `/admin/catalog` | Catalog | Membership plans + add-on services CRUD | mgr |
| `/admin/qr-codes` | QrCodes | Generates the 4 QR types + scan analytics | mgr |
| `/admin/settings` | Settings | Gym configuration, branding, legal text, password change | **owner** |
| `/admin/staff` | Staff | Staff/trainer accounts: create, disable, reset, delete; face enrolment; ID card + credential PDF | **owner** |
| `/admin/audit` | AuditLog | Staff action trail with search / category / date filters + CSV | mgr |
| `/admin/inbox` | Inbox | Member and staff messages, threaded replies, unread badge (60s poll) | mgr |
| `/admin/clients` | Clients | PT session list — **own sessions only** | trainer |

## 9. Trainer functionality

- `trainers` table with `trainer_number` (`TRN-YYYY-XXXXXX`) and `verification_code` **[C]**
- `admin_users.trainer_id` links a login to a trainer profile **[C]**
- Trainer CRUD via `/api/admin/trainers`; trainers appear on `classes.trainer_id`
- `POST /api/admin/training-session` logs a PT session + workout notes; **trainers log against
  their own profile**, owner/manager may pass `trainer_id` **[C]**
- Workout notes surface in the member's History tab **[C]**
- Trainers receive credential PDFs and contract PDFs, and have public profiles at `/p/trainer/:id`
- `resolve-member` matches **members and trainers** by number or verification code **[C]**

## 10. Documents and PDFs

All PDFs are generated **in the browser with jsPDF** — there is no server-side PDF service. **[C]**

| Artefact | File | Recipient |
|---|---|---|
| Membership card + confirmation | `src/lib/pdf/generateMembershipPdf.js` | Member |
| Member/trainer ID card (PNG) | `src/lib/idcard.js` | Member, trainer, staff |
| Payment receipt (A4, branded) | `src/lib/receiptPdf.js` | Member |
| Staff/trainer credential | `src/lib/credentialPdf.js` | Staff, trainer |
| Staff contract | `src/lib/staffContractPdf.js` | Staff |
| Board report | `src/lib/boardReportPdf.js` | Owner |

Supporting: `src/lib/pdf/terms.js`, `src/lib/pdf/labels.js`, `src/lib/barcode.js`,
`src/lib/mulesooCredit.js` (agency lockup), `src/lib/download.js`.

### Document access — a security-relevant pattern

`POST /api/document` returns everything needed to render a member's card, authorised **solely by
`membership_number` + `verification_code`**. No session is required. **[C]**
(`server/handlers/public/document.js`)

This is a **two-secret bearer pattern**: anyone holding both values gets the member's full record.
It is sound for a single gym where the member alone holds them, but it must be re-reviewed before
any cross-gym exposure — carried to [[17 - Open Questions]] and `CLAUDE.md` Stage 6.

> Documentation defect **[C]**: the handler's header comment says `/api/members/document`, but the
> router registers it at `/api/document` (`api/[...path].js`). The comment is wrong, the route
> works. Do not "fix" the route to match the comment.

> ⚠️ **Superseded 2026-09-21.** The online card path described below was **removed** —
> see [[21 - Member Payment Removal Design]]. What remains: the `payments` table, manual cash/EFT
> capture (which now **activates** the member), AR aging, dunning, receipts and reporting.
> `server/lib/paystack.js` is retained for platform billing. This section is kept as the record of
> what the system looked like at commit `c68c8c9`.

## 11. Payments

Paystack, **ZAR**, amounts converted to kobo/cents. **[C]** (`server/lib/paystack.js`)

Four endpoints: **[C]**

- `POST /api/payments/initialize` — start a transaction for a member
- `POST /api/payments/purchase-pack` — buy a session pack / plan
- `POST /api/payments/verify` — confirm by reference
- `POST /api/payments/webhook` — Paystack server-to-server

Webhook hardening is genuinely careful **[C]**: it validates the `x-paystack-signature` HMAC when
the raw body is available, **and independently re-verifies with Paystack** (treated as
authoritative), and refuses to act when a signature is present but invalid — returning `200` with
`ignored: bad_signature` so Paystack does not retry a forged call.

Also: staff capture manual cash/EFT payments via `POST /api/admin/payments`; members settle
outstanding balances themselves via `POST /api/member/pay`; `server/handlers/admin/finance.js`
produces AR aging buckets and sends dunning email.

`paystackConfigured()` gates everything — **the system builds and runs without payment keys**. **[C]**

## 12. QR codes

Four gym-level types, all built from `window.location.origin` **[C]** (`src/pages/admin/QrCodes.jsx:13-16`):

| Type | URL | Purpose |
|---|---|---|
| A — Company | `/?src=qr` | Register or log in |
| New member | `/register?src=qr` | Join |
| Existing member | `/member?src=qr` | Check in / book |
| C — Admin | `/admin/login` | Staff gate |

Plus **Type B per-person QR** at `/p/:type/:key` → `PublicProfile.jsx`, backed by
`GET /api/public-profile?type=member&key=<membership_number>` or `?type=trainer&id=<uuid>`. **[C]**

Scans are logged to `qr_scan_analytics` (type, user agent, IP) by `POST /api/scan`, which
**never blocks the page on analytics failure**. **[C]** Stats surface at `/admin/qr-codes`.

**No QR contains a gym identifier** — gym identity is implicit in the domain. This is the central
constraint for [[09 - QR-Code Architecture]].

## 13. Face and biometric functionality

Engine: **in-browser `@vladmandic/face-api`**. Templates are computed client-side; the server
stores and compares vectors. **[C]**

Matching (`server/lib/facematch.js`) uses two safeguards, not one: **[C]**

1. A similarity **threshold**
2. A person-level **margin** — the best match must beat the runner-up by a gap, which is what
   prevents confident misidentification

Configured defaults **[C]**:

| Path | Metric | Threshold | Margin |
|---|---|---|---|
| ArcFace member | cosine | `0.36` (`FACE_THRESHOLD`) | `0.05` |
| ArcFace admin | cosine | `0.45` | `0.08` |
| face-api member | negated euclidean | `-0.6` (i.e. distance 0.6, the face-api convention) | `0.05` |
| face-api admin | negated euclidean | `-0.52` | `0.08` |

Template **learning** is supported: a strong match above `FACE_LEARN_ABOVE` (0.5) can be added to
the gallery unless it is redundant (> 0.86), capped at 8 templates. **[C]**

Enrolment: during registration, via `/api/member/enroll-face` (member self-service), via
`/api/admin/enroll-face` (admin), and for staff/trainers on the Staff page.
Recognition surfaces: member face login, admin face login, and the `/admin/scan` turnstile, which
pre-fetches galleries via `/api/admin/face-descriptors` and caches them client-side for speed. **[C]**

**ArcFace is built but deliberately dormant** **[P]**: `face-service/` contains a complete
FastAPI + InsightFace (RetinaFace + ArcFace 512-D) microservice with `/embed /enroll /verify
/compare /health` and a Gradio UI. `server/lib/faceservice.js` proxies it server-side so the API
key never reaches the browser. It activates **only** when `FACE_SERVICE_URL` is set — which it is
not. The `arcface_embedding` columns exist and are empty. The app transparently falls back to
face-api, so there is no regression.

## 14. Notifications and automation

Channels (`server/lib/notify/channels.js`) **[C]**: Brevo email; CallMeBot WhatsApp; CallMeBot
Telegram. Each is independently gated by its env var and returns `{ ok:false, error }` rather than
throwing — notification failure never breaks a transaction.

All sends are logged to `notifications_log` and surface at `/admin/communications`. **[C]**

**Crons — 3 registered in `vercel.json`** **[C]**, but **8 cron handlers exist**:

| Registered | Schedule | Handler |
|---|---|---|
| ✅ | `0 6 * * *` | `daily` — orchestrator, runs jobs in isolated sequence |
| ✅ | `0 20 * * *` | `daily-summary` — owner's daily summary |
| ✅ | `0 7 * * 1` | `weekly-schedule` — weekly class schedule email |

The other five — `billing`, `expiry`, `retry-suspend`, `reengagement`, `class-reminders`,
plus `attendance-alerts` — are each **both an endpoint and a `run()` function**, invoked by the
`daily` orchestrator rather than scheduled separately. This is an explicit "Hobby-plan friendly"
design **[C]** (`server/handlers/cron/billing.js:1-2`). Cron endpoints are authorised by
`CRON_SECRET` when triggered externally.

## 15. Authentication and security posture

| Control | State | Evidence |
|---|---|---|
| Service-role key server-only | **[C]** | `server/lib/supabase.js:1-3` — explicit "never import into frontend" |
| Browser never touches Supabase | **[C]** | Frontend calls `/api` only |
| RLS enabled, no policies | **[C]** | `db/schema.sql:19-22` — default-deny by design |
| Admin/member token separation | **[C]** | JWT `audience: 'member'` |
| Password hashing | **[C]** | bcrypt, cost 12 |
| Brute-force lockout | **[C]** | 5 attempts / 15 min |
| Rate limiting | **[C]** | `server/lib/ratelimit.js`, Upstash-ready, in-memory fallback |
| Server-side pricing | **[C]** | `register.js` recomputes from DB |
| Webhook signature validation | **[C]** | HMAC + independent re-verify |
| Audit trail | **[C]** | `audit_log` + `server/lib/audit.js` |
| Security headers | **[C]** | `vercel.json`: nosniff, SAMEORIGIN, HSTS, Referrer-Policy, `camera=(self)` |
| Error capture | **[C]** | `server/lib/observability.js`, `ERROR_WEBHOOK_URL` |
| POPIA | **[P]** | Consent fields, cascade deletes, `request-deletion` — no automated erasure job |
| 2FA | **Missing** | User explicitly deferred |

**The load-bearing assumption:** the entire default-deny RLS posture is safe *only because* the
browser never talks to Supabase directly. Any design placing a Supabase client in a mobile app
invalidates it and requires real RLS policies first. Recorded in `CLAUDE.md` §21.

## 16. Deployment and PWA

- Vercel; build `npm run build` → `dist`; SPA rewrite for all non-`/api/` paths **[C]**
- Function `maxDuration` 10s **[C]**
- **Installable PWA** **[C]**: `manifest.webmanifest` (`start_url: /member`, standalone, portrait,
  single SVG icon marked `any maskable`) + `sw.js` — **network-first**, never caches `/api/`,
  never touches cross-origin, so deploys are never served stale
- Disaster-recovery runbook exists: `RECOVERY.md`

## 17. Testing and CI

`npm test` (`node --test`) — **42 tests, all passing**, executed 2026-09-21. **[C]**

`barcode` 8 · `compliance` 7 · `facematch` 15 · `pricing` 5 · `validators` 7.

GitHub Actions CI in `.github/`. Coverage is **pure-logic only** — no handler, integration, auth
or end-to-end tests exist. **[P]**

---

## 18. Feature status summary

### Complete and working **[C]**

Member registration (38-step flow, server-validated, server-priced) · member login (number +
phone) · member portal (6 tabs) · admin login with lockout · 4-role RBAC enforced server-side ·
23 admin routes / 37 admin endpoints · manual + CSV member registration · membership lifecycle ·
class management with capacity, waitlist, attendance marking · trainer management and PT session
logging · payments (Paystack + manual capture + member self-pay + AR aging + dunning) · all six
PDF artefacts · 4 gym QR types + per-person QR + scan analytics · face enrolment and recognition
on three surfaces · email/WhatsApp/Telegram notifications with logging · announcements, progress
tracking, referrals, two-way messaging · audit log · analytics and board report · PWA · 42 tests.

### Partial **[P]**

| Area | What exists | What is missing |
|---|---|---|
| ArcFace / high-accuracy face | Full microservice + server proxy + DB columns | Not deployed; `FACE_SERVICE_URL` unset; columns empty; **by user decision** |
| AI chatbot | Documented upgrade seam in `messages.js` | Scripted strings only; no `ANTHROPIC_API_KEY` wired |
| Cron coverage | 8 handlers written | Only 3 scheduled; 5 ride the daily orchestrator (plan limits) |
| POPIA erasure | Consent fields, cascade deletes, deletion request endpoint | No automated erasure or retention job |
| Internationalisation | `nationality`, `residence_country`, `display_currency`, passport branch | Charging is ZAR only; compliance text is South-African |
| Test coverage | 42 pure-logic tests | No handler, auth, integration or E2E tests |
| Door / access control | `access-action`, `access-card`, multi-door concepts | Staff are **not** on the door face scanner; `access-card.js` handles member + trainer only |
| Object storage | `photo_url` text column | No storage bucket; images/biometrics live in Postgres |

### Missing **[C — absent from the repository]**

Any multi-gym concept (`gym_id`, registry, tenant routing) · platform-owner admin panel · gym-owner
application, document review or approval · subscription billing of gyms · gym search · gym-specific
QR routing · mobile app (native or RN) · deep links / App Links / Universal Links · 2FA ·
member password or email login · SPF/DKIM configuration (a DNS task) · member WhatsApp
(CallMeBot is owner-only) · welcome-email PDF attachment · embedded PDF fonts · hourly cron.

### Unclear **[?]**

1. `src/chatbot/components/IdPhotoStep.jsx` exists but no `flow.js` step id references it — invoked
   conditionally elsewhere, or dead code? Needs a call-site trace.
2. Exact activation path from `status = 'new'` to `active` — which of payment webhook,
   `member-action`, or `server/lib/activation.js` is authoritative in each case.
3. Whether `settings` keys are documented anywhere, or only discoverable by reading handlers.
4. `qr/` contains pre-generated PNG/PDF assets — whether these are current or superseded by
   runtime generation in `QrCodes.jsx`.

---

## 19. Conflicts discovered

1. **Route vs its own comment.** `document.js` header says `/api/members/document`; the router
   serves `/api/document`. Router wins. **Documentation defect, not a bug.**
2. **Stale memory vs repository.** `session-progress.md` claims HEAD `74d4646` (2026-06-26) and
   "19 tests". Actual HEAD is `c68c8c9` (2026-07-29) and **42 tests**. The memory file has been
   corrected and is not authoritative — see `CLAUDE.md` §29.
3. **`CLAUDE.md` draft counts.** The draft handed over on 2026-09-21 said 25 tables and 24 guarded
   routes. Verified counts are **24 tables** and **23 guarded routes + unguarded login**. Corrected
   in `CLAUDE.md` §6 and §8 before approval.
4. **Vault naming conflict (resolved).** `CLAUDE.md` §27 specifies links like
   `[[Existing Yoyo Gym Audit]]` while §28 specifies filenames like `01 - Existing Yoyo Gym Audit`.
   A bare `[[Existing Yoyo Gym Audit]]` would not resolve to a numbered filename. **Resolved** by
   giving every note a YAML `aliases:` entry, so both forms work. Recorded in [[18 - Decision Log]].
5. **`CLAUDE (3).md` is inert.** The 993-line v1 spec is not named `CLAUDE.md`, so it was never
   loaded as project instructions in any session. Superseded by `CLAUDE.md` v2.

No conflict was found between the repository and the approved `CLAUDE.md` v2 after the three
corrections in item 3 were applied.

---

## 20. Related notes

[[00 - Project Purpose]] · [[17 - Open Questions]] · [[18 - Decision Log]] ·
[[06 - Tenant Architecture]] · [[09 - QR-Code Architecture]] · [[13 - Authentication and Roles]] ·
[[14 - Security and Privacy]] · [[12 - Database Architecture]] · [[03 - Protected Existing Functions]]
