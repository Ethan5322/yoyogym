---
aliases: ["Change History", "Project Change Log"]
tags: [history, log, process]
stage: "Stage 2"
status: active
updated: 2026-09-21
---

# 20 — Change History

Append-only record of what actually happened, newest first. Distinct from
[[18 - Decision Log]]: that records *choices*, this records *events* — work done, failures, fixes,
lessons. Per `CLAUDE.md` §27.1, a failure and its resolution are recorded here so the next
occurrence is answered from notes rather than rediscovered.

---

## 2026-09-29 — Design critique, then the harden pass; the first Android test build

**Critique** (`/impeccable critique`, two isolated reviews: design director + automated detector): app
28/40, website 25/40; snapshots in `.impeccable/critique/`. **Harden** (the user's scope: everything,
app member experience first):
- **App:** a screen change moves focus to its heading and names the page (it stayed on the hidden
  button); member views keep focus through loading and redraws; prices in the GYM's currency (always Rand
  before — COCATE is Ethiopian), the phone example from its dialling code (content now returns
  country/currency/dial); each inactive status says the next step (a new member: pay at reception —
  recording that payment activates them); "Searching…" on slow gym search; drawn chevrons, not "›".
- **Website:** skip link and a focusable main on every page; a lime focus ring on links, buttons and
  disclosures; the phone menu switch no longer an invisible keyboard stop; 44px sidebar links; switching
  an owner or team member off takes a second click after the consequence is stated; Reject and Request
  information need the message (Approve and Accept skip it); the PDF fallback readable on its white box
  (detector-found: light text on white); upload errors styled as errors; facts stack on a phone so an
  email does not break mid-word.

**Android:** the first test APK built after two fixes, each read from the real error: Android Studio's
Java 25 is too new for Gradle 8.14 ("class file major version 69") — a portable Java 21 now in
`~/.jdks`; and the QR scanner needs Android 8.0 (`minSdkVersion` 24 → 26). The build took 87 minutes
inside OneDrive. 1138 tests.

---

## 2026-09-29 — Final check before the build: KOM's owner could not use "Owner login"; CLAUDE.md brought up to date

Asked by the user to check for anything left over before the final build. **Found:** the email sign-in
looked for owners among `gym_owner` accounts only, and KOM's registered owner is the platform owner's
own `platform_staff` account — so KOM's owner was refused at `/owner/login`, against §43's "works for all
gym owners". The kind filter added nothing (each gym checks the password against its own account) and
is gone; any active account a gym names as its owner may sign in. **Checked and fine:** no TODO/FIXME
markers in the code; the app icon is already the new logo. **CLAUDE.md:** §5–§30 corrected where they
had gone stale (routers, schemas and table counts, object storage, sessions, crons, the PWA reversal,
the decided items in §17 and §30, the vault), and the §35 status block rewritten to the real state.
1122 tests.

---

## 2026-09-29 — Why COCATE's features were locked and its sign-ups closed; the nightly job that never ran (D-169)

**Read first (live, read-only).** COCATE resolves to Medium: 16 of 23 services; the 7 locked are exactly
the Prime-only ones, and the admin menu reads the same list the server enforces — the locks were the plan,
not a fault. Sign-ups were closed because its catalog was EMPTY (KOM's 9 plans were set up by hand before
the platform). The waiver, contract and privacy texts fall back to built-in ones, so those were fine.

**Found while fixing:** the owner's Catalog screen sent `Number("")` — a blank price became R0 — and had
only a "Monthly price" box, so a day pass, pack or trial could never be given its real price; a refused
save showed nothing. The platform nightly job had no schedule at all ("Nightly job: set" described its
secret, not a job), so switched-on billing would have charged nobody. The new filter was checked against
KOM's nine live plans first: none hidden. A quote slip in a new message broke the plans handler at load
— caught by the tests before anything shipped. 1121 tests.

---

## 2026-09-29 — Ten-minute links, email sign-in for owners, no web app (D-168)

Built from §43.1. Also found on the way: staff "Send a new activation link" retired the owner's link BEFORE
issuing a new one, so under a daily limit a refused resend would have left them with none — retiring now
happens inside the issue step, after the check. A new router block returned nothing after answering and
was overwritten by "Not found" (that part of the router says "handled" by returning true) — caught by its
test. The sign-in steps are one function (`attemptLogin`) shared by the gym sign-in and the owners' email
sign-in. 1109 tests; website build checked (no manifest ships).

---

## 2026-09-29 — The owner activated, and the gym sign-in still refused the password

**Evidence (read-only).** Activation completed at 09:52:17 (`gym_admin_created: true`, gym `active`); the
owner row exists in `gym_cocate_gym.admin_users` (username `owner`, the owner's email); `failed_logins: 2`
— so the sign-in reached the RIGHT account and the password check failed. Both sides use plain bcrypt;
the activation form decodes with URLSearchParams; the sign-in compares untrimmed. No code path found that
saves one password and checks another.

**Most likely cause, stated as such (not proven):** two passwords for one email on one site — the one
chosen when applying, saved by the browser, and the one chosen at activation. The activation form had no
username beside the new password, so the browser could not tell which saved login it replaced and kept
the old one, then filled it into the gym sign-in.

**Fixed regardless:** the gym sign-in page had NO way back in — it now links owners to the email reset
(`/platform/forgot`, which sets the Yoyo account and every gym sign-in together) and tells staff to ask
their owner. The activation page carries the owner's email as a hidden `autocomplete="username"` field
so the browser updates its saved password, and says the new password replaces the old one. 1089 tests.

---

## 2026-09-29 — What a second gym would have met: evaluation after the build fix

Asked by the user to evaluate the whole gym app and admin system once the build was fixed. Walked the
path of a NEW gym (not KOM) through the code; five defects, all specific to being the second gym:

1. **Owner alerts went to KOM's owner.** `server/lib/notify/index.js` fell back to `OWNER_EMAIL` and the
   CallMeBot variables — KOM's contacts — for every gym that had not typed its own. A new gym's members'
   names, phones, payments and **PAR-Q health flags** would have reached another gym's owner. Now the
   environment is used only when serving the home gym (`servingHomeGym()`: no gym in scope, or the
   default schema); any other gym falls back to its own owner account's email, in its own schema.
2. **Scheduled jobs ran for KOM only.** Vercel calls the cron with no gym named, so `withGym` served the
   home gym alone: no other gym's memberships ever expired, reminders never went, pauses never ended,
   overdue members were never suspended. `forEveryGym()` (`server/lib/every-gym.js`) now runs each job for
   every active gym inside its own schema, one gym's failure not stopping the next; with the registry
   unreadable, the home gym still runs (fail open). A call naming a gym still runs for that gym alone.
3. **A new gym had no name of its own.** Provisioning seeded `gym_profile.gym_name`; everything reads
   `gym_profile.name`. Seeded as `name` now, merged on a retry; notifications fall back to the registry
   name, never to KOM's sender name.
4. **A member could type everything before learning the gym sells nothing.** A new gym has no plans;
   the chatbot reached "No membership plans are configured yet" after the details and PAR-Q. The page
   now says so first, and the owner's dashboard leads with "Add your membership plans".
5. **The catalog cache was one slot for every gym** (`src/lib/useCatalog.js`): another gym's plans could
   show in the same session. Keyed by gym now.

Checked and fine: QR codes follow the gym's own `/g/<slug>/` address; branding uploads go to the gym's
own folder; the member-services cache is keyed per schema; activation creates the owner's gym account
before consuming the link and opens the gym. 1085 tests (7 new).

---

## 2026-09-29 — The first live gym failed to build: the wrong owner field (D-167)

**Reported:** COCATE GYM was approved, and its owner's gym sign-in said "Invalid username or password".

**Read the actual evidence first** (platform audit log, read-only): `gym.provision.failed` at 08:22:27,
`failed_at: saveConnection`, `Cannot read properties of null (reading 'id')`, `orphaned_schema: gym_cocate_gym`.
No `gyms` row existed. So no activation was issued and no owner account was ever created in the gym —
every sign-in was refused because there was nothing to sign in to.

**Cause, from the code.** `provisionGym` saved `owner_user_id: application.owner_user_id`; a
`gym_applications` row has `applicant_user_id` and no `owner_user_id`. `gyms.owner_user_id` is NOT NULL,
so Postgres refused the row — and `saveGym` discarded the returned error and handed back null, which
crashed the next step with a message that named neither. **Why tests passed:** the provisioning test's
fixture carried `owner_user_id: 'user-1'`, a field no real application has. Also found: the gym was
never given the plan the owner chose (`plan_key` unset, trial opened with `plan_id` null).

**Fix.** The owner comes from `applicant_user_id` and is checked before anything is created; the gym gets
`requested_plan_key` and its trial opens on that plan's row. Every provisioning step now throws the
database's own message, and finds and reuses what an earlier attempt saved. A failed build is retried from
the application page ("The gym was not fully created … Try again"), allowed only when the latest attempt
failed; it records `provision_retried`, finishes the gym, and issues the activation. The failure event now
records `orphaned_schema` (it recorded a project ref, from the retired project-per-gym design). The test
fixture is a real application row. 1078 tests.

**Lesson.** A test fixture typed by hand can agree with the code and disagree with the database. Build
fixtures from the real row shape, and never let a helper swallow a returned `{ error }`.

---

## 2026-09-29 — The application in three steps (D-166)

**Built:** details → documents → check and submit. The details save a **draft** and sign the owner in, so
uploading starts at once and continues later from any device. One box per document, PDF or photo; photos
become JPEG on the device (max 2400 px). Submit is refused server-side without the three documents, a
rejected file does not count, and an application can be sent once. Reviewers see a draft under "Waiting on
the owner" with "Not sent yet" instead of decision buttons; a photo their browser cannot draw says so and
offers Download; downloads are now audited (`platform.document.downloaded`), as are direct opens.

**Also corrected:** the "application received" email still listed four documents including tax clearance
(required since §40.1 Q3 are three); it now goes out on Submit and lists none. The owner's page picked
their application by `submitted_at`, which put a new draft behind an old decided one; now by `created_at`.
Two applicants using the same gym name get a plain message instead of "could not submit" (unique index).

**Verified.** 1065 tests (22 new). Screens checked at phone and computer width with made-up data: the
three steps, the sent page, a reviewer's draft.

---

## 2026-09-29 — Every two-part platform address was a Vercel 404 (CLAUDE.md §42.1 F-42.1)

**Reported by the user:** an application submitted with no documents, no working upload, and a
"404 NOT_FOUND" page on clicking the application in the panel. Two applications left waiting.

**Read the actual error first.** `curl -D -` on production: `X-Vercel-Error: NOT_FOUND`, plain-text
body — Vercel answering, not the router. One-segment addresses (`/platform/plans`) reached the
function; every two-segment one (`/platform/applications/<id>`, `/platform/my-gym/documents/request`,
`/platform/registry/<id>`, `/platform/api/gyms`) did not, and `/api/platform/a/b` failed the same way.
Vercel's docs (Gatsby page, "splat API routes"): outside Next.js a catch-all file has no native
support and needs a rewrite. **Our gym routers never noticed** because they are a fixed key map of
single names (ids travel in the query); the platform router is the only one built on nested paths,
and its tests call it directly, never through Vercel.

**What it broke, live, since the platform went up:** the application page and every decision,
opening and uploading documents, a gym's page (suspend, plan, services, activation link), and the
app's gym search and sign-ins under `/platform/api/`.

**Correction.** The 2026-09-28 entry below explains "the application page says fail" as the
applicant's own account. That was a guess stated as "likely", and it was wrong: this was the cause.
It was rendered locally, which is exactly the path that could not see it.

**Fix.** Two rewrites in `vercel.json`, placed before the one-segment rule and leaving it untouched:
`/platform/:first/:rest+` and `/api/platform/:first/:rest+` → `/api/platform/[...path]?__pp=…`. The
entry file calls `restorePlatformPath()` (`platform/vercel-path.js`), which puts `/platform/<path>`
back into `req.url` and keeps the rest of the query. Six tests. **It can only be proven on Vercel**:
the preview sits behind Vercel's login, so the first live check is production.

---

## 2026-09-29 — Before the first live gym: three defects in provisioning, found by reading it

The user switched gym creation on (`PLATFORM_PROVISION_LIVE`, project ID, `sbp_` token; Settings
shows **ready**) and confirmed read-only that `authenticator.rolconfig` holds
`pgrst.db_schemas=public, graphql_public, gym, platform` — so `exposeSchema` (D-151) reads the real
list and only appends. Nothing has been provisioned yet. Before the first approval:

1. **A new gym's schema would have been closed to the server.** `db/schema.sql` grants nothing, and
   a schema created by SQL is closed to the API roles until granted (Supabase, "Using custom
   schemas" — checked in the docs, not assumed). `gym` and `platform` were granted by hand. The
   first gym would have been created, registered, exposed — and every read refused with
   "permission denied for schema". **Fix:** `applySchema` now also runs `accessGrantsFor(schema)`:
   usage, all tables / sequences / routines, and default privileges — to **`service_role` only**.
   The guide also grants `anon` and `authenticated`; here that would open the gym to the public key
   the moment any policy existed (§21).
2. **A wrong token would have stranded the application.** Readiness checks only the settings'
   shape; the first real call was `createSchema`, after "approved" is recorded, and an approved
   application can never be approved again. **Fix:** `canReachProject()` (`select 1`) runs after
   the document check and before anything is written; a refusal says so and leaves it waiting.
3. **Four tables had no RLS in a new gym.** `admin_inbox`, `announcements`, `progress_entries`,
   `referrals` get RLS from their migrations in KOM, but were missing from `db/schema.sql`'s RLS list.
   Added; a test now fails if any table in the file is missing from the list.

Still true, stated plainly: a provision that fails after the approval is recorded has **no retry
button** — it needs a hand fix. The checks above remove the known causes; they do not add a retry.

---

## 2026-09-29 — Price changes were never audited (found while saving the support WhatsApp)

**Failure.** Saving the Prime WhatsApp line (`+27688529333`, on the user's instruction) left no
audit entry. `platform_audit_log.entity_id` is a **uuid** column; plan changes pass the plan key
(`'basic'`) and support-contact changes pass `'support'`, so Postgres refused the whole row. And
supabase-js **returns** its error instead of throwing, so the `try/catch` in `audit()` never saw it.
Live evidence: all three plans priced, **zero** `platform.plan.updated` entries — the one record
D-128 promised ("who changed the price, and when") had never been written.

**Fix** (`platform/deps.js` `audit()`): a value that is not a uuid moves to `detail.entity_key` and
`entity_id` stays null; a refused insert is now logged with its action. The audit page shows the key
where the id would be. Two tests. The support change was recorded again with the fix. No SQL.

**Lesson.** A helper that "never throws" must still look at the `{ error }` it is handed back.

---

## 2026-09-29 — Four new member services (D-165)

**Built one at a time, each end to end:** rules as pure functions (`pauses.js`, `loyalty.js`,
`groups.js`), handlers for the owner and the member, the morning job, the owner's screens, the
member portal, the app. **Every figure is counted from what happened** — points and challenge
progress from check-ins, never a number anyone can type.

**Found on the way:** re-running `platform/seed.sql` overwrote each plan's services and member limit
with the defaults (`on conflict … set features = excluded.features`). Harmless while nothing else set
them; since the Plans page switches services, it would have silently undone the platform owner's
choices. The seed now names plans and nothing else on a re-run.

**Test approach:** the handlers run against an in-memory stand-in for the database
(`tests/fake-db.js`), inside the gym's scope, exactly as the router runs them. It throws on any query
it does not understand, so a test cannot pass by accident. One honest limit, written into the test:
the stand-in does not apply column defaults (a claim's `pending` comes from `db/schema.sql`).

**Lesson applied:** every new file name was checked free before writing — the outage of 2026-09-28
came from one that was not. `server/handlers/cron/daily.js` had drifted to CRLF in the working copy
and was normalised before editing.

**Verified.** 1027 tests. Screens checked: the owner's Rewards and Challenges pages, a member's page
with pause and family, the member portal's status (pause, family) and Rewards tab; the app's Rewards
tab, pause and family through its own tests.

**Live 2026-09-29.** The user ran both SQL files; checked read-only afterwards — the seven gym tables
answer, and the plans hold Basic = pause; Medium = + rewards, family; Prime = + challenges. Pushed to
the preview (`stage-8-app`), CI and Vercel passed; then, on the user's "deploy", to production
(`main` = `544d2f9`, Parts 1 and 2 of §41 together). Production checked signed out: health `ok` with
no pending migrations or missing columns, KOM found by the gym search, the apply page shows the
plans, "Every plan includes", the DRAFT terms and the required tick, and the new owner and member
routes answer 401 (asking for sign-in) rather than crashing.

---

## 2026-09-28 — The outage, and services as data (D-164)

**THE OUTAGE, and the fault was ours.** The user reported "Request failed (500)" inside the admin
panel. Reproduced on production: the WHOLE admin API and the whole member API answered
`FUNCTION_INVOCATION_FAILED`, even signed out. Loading the router locally gave the real error:
`sessions.js does not provide an export named 'consumeSession'`. `efedc0b` (stay signed in) had
written its code into a NEW `server/lib/sessions.js` and so replaced the file of that name, which
held `consumeSession` for session packs. A router loads all its handlers at once, so one missing
export took both APIs down — on the preview since that morning, on production since the 16:30
deploy. **Fixed in `3f81eff`**: the function restored word for word in `session-packs.js`, and
`tests/routers-load.test.js` now loads every router, handler and library module. **Why 957 tests
passed:** no test had ever imported a router. Lesson: *before creating a file, check the name is
free* — and a test suite that never loads the entry points cannot see them break.

**"The application page says fail".** Rendered locally with the real code and data for the staff
account: it opens. The only account that could not open it is the gym-owner account that APPLIED —
which, before `bb49f5f`, was shown the staff menu. Stated to the user as the likely cause, not a
proven one.

**Found while building Part 1:** the registration page built its plans from the code with
`price: null`, so it said "Contact us" for plans with prices set — the page now reads the live
plans. Three of our own registration promises were not fully true (the app is not in the stores yet;
self-service import and the audit-log screen are not on every plan) and were rewritten before
anyone saw them.

**Escaping, twice more.** Two Python patches wrote a real line break where the code needed `\n`, and
one failed to match; every patch asserts before writing, so nothing half-applied. The editor fixed
each one. The rule stands: code containing backslashes goes through the editor or a file.

**Verified.** 998 tests (31 in `tests/services.test.js`; `tests/panel-links.test.js` follows every
link and form on every panel page through the real router — none leads nowhere). Screens checked at
computer and phone width: registration page, plan switches, a gym's services, owner support card,
the owner's Settings, and a gym's "What we offer" on a phone.

---

## 2026-09-28 — The main admin panel, corporate level (D-162, D-163)

**Production deployed first**, with the user's go-ahead: `main` caught up with the preview
(`da6b0aa`, 33 commits). Before pushing, the five SQL files in those commits were checked READ-ONLY
against the live database — all present — and the live site was smoke-tested after. **Correction:**
earlier notes said everyone would sign in again on deploy. They do not: only a session opened at a
`/g/<slug>/` address before the gym was stamped into tokens does.

**Checked against the live data, not only the code.** One application (0 documents), one gym (KOM),
three priced plans, one staff account. The PDF path was proven for real: a throwaway file uploaded
exactly as the owner page sends it, opened as the reviewer's link does (`application/pdf`, inline,
nothing blocking the viewer, bytes identical), then deleted.

**What was wrong, and is fixed (§40.1 F-40.1 … F-40.10):**
- Suspending KOM locked only `/g/kom/`. A request naming no gym never met the registry.
- A gym owner saw the staff menu, and **Today had no permission check** — any owner could read
  platform-wide figures.
- The reviewer could not see who applied; nothing was required before Approve; a rejected owner was
  never told (`decisionEmail()` existed and was never called).
- No way to send a new activation link; no way to add a staff member except SQL.
- **Found while building:** a switched-off staff member kept every permission until their 8-hour
  cookie expired — `permissionsFor` never read `is_active`. It does now.
- **Found while building:** the staff search boxes put typed text straight into a PostgREST `or()`
  filter, where a comma adds a condition. `searchText()` now cleans it for all three searches.

**Failures worth remembering:**
- **Escaping through heredocs, again.** Two Python patches failed to match text that was byte-for-byte
  identical, because the shell and Python each had a turn at the backslashes. Neither wrote anything
  (every patch asserts before it writes). What worked: write the new code to a scratch file with the
  editor, then splice it in with a small script that reads that file.
- **`platform/schema.sql` had drifted to CRLF in the working copy** while git holds LF. Normalised
  before editing. In Git Bash, `grep -c $'\r$'` counts every line — count `\r` bytes with Python.

**Verified.** 957 tests pass (42 new in `tests/main-admin-panel.test.js`, 8 in
`tests/home-gym-control.test.js`). Every redesigned page screenshotted at computer and phone width
with made-up data; the screenshots found six layout faults the tests could not (money wrapping,
stretched buttons, a stray scrollbar, a stretched checkbox), all fixed.

---

## 2026-09-28 — Stunning end to end (D-161)

**Found by looking, not guessing.** The admin panel was screenshotted from the real production
build with every API call answered by made-up data (Chrome DevTools protocol, a fake token; no real
member, no password). What it showed: five red banners stacked as the dashboard's first impression;
every member status printed in the accent colour, so a healthy "active" looked like an error; mixed
text glyphs (▣ ◷ ⛨ ☰) as sidebar icons.

**Failures worth remembering:**
- **AI upscaling on this machine:** Real-ESRGAN's GPU build produced corrupted tiles
  (`vkQueueSubmit failed -4`), then its files vanished from disk (most likely the antivirus). The
  user said to stop and keep the picture. Do not retry upscaling tools here.
- **The poster did not show at first:** the page's pre-mount style gives `html` a background, so
  `body`'s own background is painted in-flow — ABOVE a `z-index: -10` fixed layer. Fixed with
  `isolation: isolate` on `body`. Same technique for the app's `#member::before`.
- **Escaping, three times in one day:** regexes and apostrophes written through shell heredocs
  and Python strings lost backslashes (`\\]`, `\\d`, `gym's`). Each was caught — by `node --check`, a
  failing test or the build — but the lesson stands: write code that contains quotes or backslashes
  with the editor or a file, not through a heredoc.
- **Money on phones:** "R95 400,00" at hero size overflowed two columns; the dashboard now shows
  whole rands (payments and receipts keep cents).

**Verified.** Screens compared before and after on computer and phone widths; poster shown behind
splash, admin sign-in and sidebar; tests for the poster check, backdrop placement, status labels and
the app's poster.

---

## 2026-09-28 — Each gym's own app (D-160)

**Asked:** once someone belongs to a gym, the app is that gym's app — it remembers them, keeps them
signed in, and shows the gym's own picture and icon; the owner decides what the front shows.
Recorded as `CLAUDE.md` §38 word for word, then five questions (§38.1).

**The user ran the SQL** (session_version on members and admin_users in every registry schema; the
public `gym-branding` bucket). The first paste failed with `syntax error at or near "The"` — the
explanation text around the SQL was pasted too; Supabase ran nothing. Resent as SQL only. Lesson:
give SQL to paste on its own, with no prose in the same block.

**Design choices worth remembering:**
- The long-session check sits in the **three routers**, not in 50+ handlers — the same "one place"
  rule as plan enforcement. Short tokens carry no `sv` and never cost a query.
- `withGym` passes the router's callback result straight through, so the callback can be async.
- The web admin sign-in knows it is inside the app only because the app opens it with
  `?app=1&back=…` (`src/lib/inApp.js`); `back` is accepted only for the app's own local origins.
- A cover picture is validated as `cover-<digits>.jpg` inside the gym's OWN folder — a looser
  pattern first allowed `..`, caught before commit.
- An unescaped apostrophe in a JSX string (`gym's`) passed every test and failed the production
  build: tests do not compile the React screens. The build is part of "verified".

**Verified.** 901+ tests (new: `tests/sessions.test.js`, `tests/gym-app-home.test.js`, cover checks);
production build; the app's gym home screenshotted with a canned signed-in KOM member.

---

## 2026-09-28 — "IDs and PDFs still carry the old name" (D-159)

**Investigated** (§27.1). Two causes, both confirmed by reading the data and the code:
1. **Data.** KOM's `gym.settings.gym_profile.name` was still **"Yoyo GYM"** — KOM *is* the old
   single gym, attached as tenant #1 without moving data (D-146), so its Settings kept the old name.
   The registry already called it "KOM" (`platform.gyms.search_name`). Its saved welcome message,
   indemnity waiver and privacy policy also said "Yoyo GYM".
2. **Code.** ~20 places printed "Yoyo GYM" as a fallback or as fixed text (door-scanner header,
   public profile page, QR and attendance printouts, Settings defaults, PDF/ID defaults).

**Changed with the user's approval, name only, verified field by field:** the saved name → "KOM"
(1 of 9 profile fields changed); the three texts each got exactly 5 characters shorter
("Yoyo GYM" → "KOM"), nothing else touched.

**Also:** `FaceScan.jsx` and `PersonalQr.jsx` had Windows line endings (the first committed so in
`adec371`, the second only on disk) — normalised to LF, matching production.

**Lesson.** A gym attached from before the platform carries single-gym data. Anything the old
deployment wrote with its own name in it is now that gym's data, and needs the same check.

---

## 2026-09-28 — "It does not recognise KOM's owner email and password" (D-158)

**Investigated, not guessed** (§27.1). The gym admin sign-in (`/api/auth/login`) looked accounts up
by `username` only. Read-only check of KOM's `gym.admin_users`: the owner's username is `owner`,
active, not locked, **0 failed attempts** — so the attempts never matched an account at all, which
is exactly what typing an email into a username-only box produces. (The same email is also a Yoyo
*staff* account on `/platform/login`, where 2FA is on, so a code is required there.)

**Fixed, with approval:** email or username (D-158). Verified against KOM's live accounts,
read-only: username → `owner`; the email in capitals with spaces → `owner`; `%@gmail.com` → no match.

---

## 2026-09-28 — The website's front page, made to match the app (D-156 follow-up)

**Reported by the user on the preview:** "I can't see where the gym owner signs in — it only asks to
register as a gym owner or as a member, no sign in as member." True: the new first screen lives only
inside the phone app. The preview address opens the WEBSITE's `/platform/welcome`, which offered
only "Find your gym" and "List your gym", with sign-in as one small link — and that link went to the
Yoyo staff login, not a gym's admin panel.

**Fixed.** `/platform/welcome` now mirrors the app: the photograph (it carries the logo, so the page
has no header logo), the headline, and every choice — Member: *Join a gym* / *Member sign in*;
Gym owner: *Owner login* / *Apply to join Yoyo Gyms* / *Check application status*; plus privacy,
account deletion and Yoyo staff sign-in. The finder takes `?next=join|signin|admin` from a fixed list
and sends the picked gym to `/g/<slug>/register`, `/member` or `/admin/login` — the gym's OWN admin
sign-in, never the Yoyo panel (§36.1 Q2).

**Lesson.** A screen built for the app must be checked for its web twin too (§14 requires a web path
for everyone without the app). The preview a user opens is the website, not the app.

---

## 2026-09-28 — The new brand everywhere (D-157)

Committed first: the landing redesign, `8403eab`. Then the user asked for the new colour and logo on
everything. Four questions settled it (`CLAUDE.md` §37.1); the answers are in D-157.

**Found while doing it.**
- **Gyms' colours were never really applied.** 34 rules in `src/index.css` and every PDF hard-coded
  red; only a few Tailwind classes followed the gym's setting. Now everything follows `--accent`.
- **15 `border-accent/30`-style classes never worked**: Tailwind cannot make `var(--accent)` see-
  through. The accent is now defined in RGB form, so they finally render as written.
- **White text on lime is unreadable** — 16 buttons and badges, the PDF header bands and the PAR-Q
  "YES". Text colour is now chosen by contrast (`inkOn`), and a health warning is a fixed warning
  red rather than whatever the brand colour happens to be.
- **The Settings form pre-fills the accent**, so almost every gym has red *saved*. The user chose to
  keep saved colours (KOM stays red) rather than treat the old red as unset.
- **Editing on Windows turned 14 files from LF to CRLF**, which makes a two-line change look like a
  whole-file rewrite and differs from CI (Linux, LF). Before any commit: compare
  `tr -cd '\r' < file | wc -c` with the same count on `git show HEAD:file`; fix with `sed -i 's/\r$//'`.
- `@capacitor/assets` also reformats `AndroidManifest.xml` (blank lines only). Restored; nothing in
  it changes.

**Verified.** 869 tests pass (9 new, in `tests/brand.test.js`, including "the old red is nobody's
default" and "the iPhone icon has no alpha channel"). The web app builds. Every PDF was generated
from the real code and rendered to images; the ID card was rendered in Chrome; the gym screens were
served from a production build and screenshotted; the four business PDFs and the QR sheet were
regenerated, and the QR images came out identical, so every printed code still works.

---

## 2026-09-28 — The app's first screen, redesigned (D-156)

The user gave a written design for the app's landing screen and the paths from it, plus their own
images: a finished mockup (photo + logo + text + buttons) and the logo alone. It was added to
`CLAUDE.md` as §36, word for word, then checked against the code; eleven contradictions and gaps
were answered one at a time (§36.1).

**Images.** Only the photograph (with the user's logo on it) was cut from the mockup: its drawn
status bar, headline and buttons are rebuilt as real, tappable elements. A small brand-like white
mark on the shorts was painted out ("no visible third-party logos"). The logo was made transparent
in two colourings: navy turned white for dark screens (`logo-on-dark.png`), and the original colours.
All bundled in the app, so the first screen works with no signal.

**Built.** The first screen, Welcome Member, Welcome to [Gym], Join [Gym], Welcome Gym Owner,
Bring your gym to Yoyo, Gym owner login (the gym's own admin sign-in) and Help, in
`apps/mobile/www/`. A back stack, so Back returns where the person came from. The website's
sign-in restyled, with `?as=owner` so an owner is not shown "Platform administrator login".

**Found while building.**
- The staff panel cannot be linked from the app today: it shares the member host, and Capacitor
  keeps any allowed host INSIDE the app. `adminHost` (already in `shell.config.json`, never used)
  is how it will leave for the browser once a domain exists.
- My new default button colour leaked into the member area and put dark text on the gym's red.
  Fixed by giving `#member` back the gym's accent and white text, without touching member rules.
- **Local `node_modules` had lost packages** (bcryptjs, supabase-js, vite plugin, face-api…), so
  every platform test failed to import. Not a code fault: `npm ci` restored them from the lock file.
  If tests suddenly fail with `ERR_MODULE_NOT_FOUND`, check `npm ls --depth=0` for UNMET first.

**Verified.** 860 tests pass. Every screen screenshotted at 390×844 (and 667 tall) through Chrome's
DevTools protocol; full-window headless Chrome cannot go below ~500px wide, so its screenshots of a
phone layout are misleading.

---

## 2026-09-24 — Preview testing by the user: sign-in, registration, the owner journey, faces

The user tested the preview and hit these problems:
- **Member sign-in always failed.** Phones are stored `+27…` and members type `082…`. Proven on a real member; fixed with `phoneMatches()`.
- **Registration appeared frozen.** The answer area grew past the bottom of the chat. It now scrolls.
- **No way to reach owner or member registration from the website.** `/` now opens `/platform/welcome`.

**The owner journey, made complete:**
- An application under an existing account now requires that account's password; before this, anyone could file one in someone else's name.
- A confirmation email is sent on applying.
- **Approve refuses, and records nothing, unless the server can actually create a gym.** `provisioningReadiness()` checks the settings by name, and flags a token that isn't `sbp_…` or a project ID that looks like a URL. Before this, a missing setting left the application "approved" with no gym, and approval can't be repeated.
- A refused decision is shown with its reason. The staff home says "Creating new gyms: Ready / Not ready".
- The server function limit is now 60 s, because creating a gym runs inside the Approve request. Vercel's docs allow Hobby up to 300 s with Fluid compute and 60 s without.
- **Activation now requires accepting the Gym Owner Agreement.** The acceptance and its version are recorded in the audit log. The owner gets an **Owner ID** (`YG-OWN-XXXXXXXX`, derived from the account id) and can download a **PDF agreement** from the owner page.
- The terms are written from `TRIAL_DAYS` and `GRACE_DAYS`, and stay a **DRAFT** until `PLATFORM_TERMS_APPROVED=true`.

**Faces:** member face galleries keep enrolment anchors plus a rolling window of learned appearances. But learning happened only on face sign-in from the member's own phone, never at the reception door scanner, so most members' galleries froze at enrolment. `admin/face-learn` fixes this: the scanner *suggests* a member, and the server re-identifies the face against every member and learns only if it agrees. That stops a reception login from planting one person's face on another's record.

**Lesson recorded.** *A preview tested by a person finds what tests written against assumptions cannot.* All three of the user's failures passed every automated test.

---

## 2026-09-24 — Full wiring audit: every button, link, API call and column

Asked for before user testing: *is every button built and working?* Checked mechanically, not by
reading screens:

| Surface | Checked | Result |
|---|---|---|
| Platform panel | 38 link/form targets vs 55 routes | all resolve |
| Gym app (admin + member portal) | 116 API calls vs router keys, 35 links vs 36 pages | all resolve |
| Buttons | every `<button>` in the React app and the app shell | all have an action |
| **Database columns** | **959 column references vs the real schemas** | **3 real faults** |

**The three faults.** All three failed silently, because PostgREST returns an error object instead
of throwing, and each test's fake database accepted any column name:
1. **`members.data_deletion_requested` was never created.** No schema file or migration adds it,
   so every member's "Request data deletion" failed. Migration
   `db/migrations/2026-09-24-member-deletion-request.sql` is written and **not run**. The column is
   now also in `db/schema.sql` for new gyms.
2. **`checkins.created_at` does not exist.** The platform's per-gym "check-ins this month" and
   "last activity" were blank for every gym. It now reads `checked_in_at`, and a failed query
   shows as "unreachable" rather than blank figures.
3. **`settings.id` does not exist.** `/api/health` reported a healthy database as "DB error".

`tests/schema-columns.test.js` now reads the real schema and fails on any query naming a column
that does not exist. The only exceptions are the two `gym_secrets` columns of unwired project
mode, each listed with its reason.

**Lesson recorded.** *A fake that accepts anything proves nothing about names.* The same shape as
the scanner bug: tests mocked what the code assumed, not what exists.

---

## 2026-09-24 — Stage 8 opened: the app's own screens, and four things that never worked

**800 tests pass.** Not deployed, and **not yet run on a real device**: no emulator or device is
available here. The screens are tested by driving them in a simulated browser (jsdom).

**Built (D-155):**
- **Native member screens.** Sign-in, a Home screen showing status first, one-tap check-in, a Card
  that works offline, Classes (only on plans that include them) and Profile. They call the same
  `/api/member/*` endpoints as the website. Registration stays on the gym's web flow.
- **Brand icon and splash** on Android and iPhone, drawn from `public/icon.svg`.
- **Native behaviour:** Android back button, status bar, splash, haptics, and a no-signal message
  instead of Android's raw error page.
- **The iPhone project,** generated on Windows through Swift Package Manager. It needs a Mac to
  build and sign.

**Four things that could never have worked:**
1. **No CORS headers.** On a phone, the app could not read any reply from its own server, so gym
   search and "which gym did I join?" failed.
2. **`iosScheme: 'https'`.** WKWebView refuses a custom handler for http or https, so the iPhone
   app could not load its own pages.
3. **The QR scanner called another plugin's API.** It used `BarcodeScanner.checkPermissions/scan`,
   but the installed plugin is `CapacitorBarcodeScanner.scanBarcode()`. Every tap answered
   "Scanning needs the Yoyo Gyms app", inside the Yoyo Gyms app. The plugin was also the
   Capacitor 7 line; it is now 3.1.2.
4. **`Permissions-Policy: geolocation=()`** switched location off on every web page, so "near me"
   on `/platform/find` never worked.

**Caught by the new tests before shipping:**
- The check-in success state vanished as soon as it appeared.
- An unescaped apostrophe was a syntax error that would have made the whole entry screen dead on
  arrival. A test now parses every script the app loads.

**Lesson recorded.** *Test code against the thing it calls, not against what it was written to
expect.* The scanner had tests; they mocked the API the code assumed. A test pinned to the
installed plugin's own type definitions would have failed on day one.

---

## 2026-09-24 — Store blockers: password recovery, account deletion, privacy policy

**755 tests pass.** Not deployed. **Two migrations written and NOT run:**
`platform/migrations/2026-09-24-password-resets.sql` and `2026-09-24-account-closure.sql`.

**Password recovery** did not exist. The new `platform/password-reset.js` uses single-use links
that last one hour and are stored as hashes only. A request gets the same answer whether or not the
account exists, and requests are rate limited.

**A reset sets both of the owner's passwords.** Activation gives the owner the same password on the
platform and inside their gym, so a reset that changed only one would have locked them out of their
own gym.

**Also fixed:** the sign-in page marked the 2FA code as `required`, which is optional for owners.

**Deletion:**
- Erasing a member left their entry in `platform.member_directory`, so the platform could still say
  which gym they had belonged to. They are now removed from it, and a failure is reported to the owner.
- Members' deletion requests now appear on the gym dashboard by name.
- Owners can ask to close their account. This records the request and deletes nothing by itself.
- `/platform/delete-account` is the web route the stores require.

**Privacy policy** at `/platform/privacy`. It is written from the code, and a test fails if the
code calls an outside service the policy does not name. It shows as a **DRAFT** until
`PLATFORM_PRIVACY_APPROVED=true`.

**Found while writing the policy:**
- **New-member alerts go to the owner through CallMeBot**, a free third-party WhatsApp/Telegram
  relay. They include the member's name, phone, email and whether the PAR-Q needs a doctor's
  clearance. That is health information passing through a third party. It is disclosed now; whether
  it should happen at all is a decision.
- **No code deletes a closed gym's data.** D-071 reports the gym after 90 days suspended; a person
  decides. The draft policy nearly promised automatic deletion. It was corrected, and a test now
  stops that promise coming back.
- The policy says declined applicants' documents are deleted after 90 days. **That is only true
  while `PLATFORM_RETENTION_LIVE=true`.**

**Lesson recorded.** *Write a policy from the code, not from a template.* Two of its first draft's
sentences were false, and one real data flow was missing.

---

## 2026-09-24 — Plans were never enforced; gyms were not kept apart on the client

Found by an audit of CLAUDE.md against the code. **715 tests pass.** Not deployed.

**No plan limit had ever applied to any request.** Three faults stacked:
1. `resolveGym()` returned no plan, so `resolved.features` and `resolved.plan` were undefined.
2. The admin router checked the plan *before* `withGym()`. The gym only exists inside that scope, so
   every check saw single-gym mode and allowed everything.
3. The member and auth routers checked nothing.

**Fixing (2) alone would have caused an outage.** With no features on the resolved gym, every gated
route would have answered 402 for every gym, KOM included.

Fixed:
- `tenancy-deps.js` now loads `platform_plans` alongside the gym (cached, still data).
- All three routers check the plan inside `withGym()`.
- New `MEMBER_ROUTE_FEATURES` and `AUTH_ROUTE_FEATURES` maps.
- A test checks that every live route has a mapping. An unmapped route fails closed with 404, so a gap
  would have broken a KOM screen on deploy.
- KOM is on PRIME, which reaches every route.

CSV import now respects the member limit, and reports the rows it could not import. The admin menu
shows locked screens with 🔒. A 402 opens a single upgrade notice: owners are offered the plans,
other staff are told who can change it. Members see only the portal tabs their gym's plan includes,
and are never told to "upgrade".

**A token without a gym could choose one.** `gymForRequest()` treated a token with no gym claim as
"whatever the header says". The unslugged `/admin/login` still issues such tokens, so any KOM staff
member could become admin of any gym by sending `X-Gym-Slug`. Reproduced, then fixed: a gym-less
token is now refused whenever a gym header is present.

**Three client requests never named their gym:** the member portal client, the QR scan logger and
the public profile page. A member of any gym but KOM signed in against KOM's members. Fixed with one
`gymHeaders()` helper. Sessions are now stored per gym, because every gym shares one origin.

**App:** "Use my location" could never work on Android, because no location permission was declared.
Fixed, and the app now remembers the member's gym.

**Found, not fixed:** project mode (a gym with its own Supabase) can never connect. `tenancy.js` reads
`secrets.service_key`, but `fetchSecrets` selects `service_role_key` from `gym_secrets`, and that
table holds references only by design. It needs the secrets-manager lookup it was designed around.
No gym uses project mode.

**Lesson recorded.** *A check that runs outside the context it reads from always passes.* The
entitlement tests set the gym up by hand, so they passed while the router never saw a gym. Test the
path a request actually takes, not the function in isolation.

---

## 2026-09-24 — Protections that were written down but never wired

Found by walking the app's flows end to end. **675 tests pass.** Not deployed.

**Platform sign-in had no lockout.** `platform_users.failed_logins` and `locked_until` existed from
the first schema, commented "5 attempts → 15 minute lock". No code read or wrote either. Gym owners
sign in with a password alone, and that password reaches their gym and every member in it. Fixed in
`platform/login.js`: one `decideLogin()` now called by **both** the website and the app door. The two
doors used to carry their own copies of the rule, which is how the lockout ended up on neither.
Attempts refused by the lock still count toward the brute-force alert.

**`/platform/api/member/find-gym` was unlimited.** The comment said "rate limited hard" above
`deps.rateLimitFindGym?.(req)`, and the dependency was never written. The optional chain turned "not
wired" into "no limit" without a sound. Now called without `?.`, backed by `platform/ratelimit.js`
(5 per 10 minutes per address), and listed in the deps-merge test, whose list of required
dependencies was the other half of how this stayed hidden.

**"Use my location" did not find the nearest gym.** It fetched any 25 active gyms, then sorted
those 25. `platform/gym-search.js` now searches boxes of widening radius (25/100/500/2500 km, then
anywhere). **And `Number(null) === 0` a fourth time:** a gym with no coordinates was measured as
though it stood at 0°, 0°.

**The app called a failed search "No gyms found"**, which told members their gym was not on Yoyo
Gyms. It now reports a connection problem, and a slow older search answer can no longer overwrite
a newer one.

**Lesson recorded.** *A comment is not a control.* All three of the first findings had a comment,
a column or a promise describing a protection that did not exist. When auditing, check that the
comment is backed by code that actually runs. `?.` on a security dependency is a smell: it makes
absence indistinguishable from permission.

---

## 2026-09-21 — Cookies brought CSRF with them

**Built** `platform/http.js`: session cookies, CSRF tokens and the route guard. **115 tests pass.**

**The finding worth recording.** Choosing server-rendered HTML (D-091) quietly changed the
authentication model. The gym app holds a Bearer token in JavaScript and attaches it deliberately;
these pages cannot, so the session lives in a cookie — and **a browser attaches cookies
automatically to any request to the origin, including one triggered by a form on someone else's
site.** That is CSRF, and **the gym app has never had this risk**. It arrived as a side effect of a
decision that looked purely about rendering.

**Two defences, deliberately both.** `SameSite=Strict` is the strong one and would probably suffice.
A session-bound CSRF token is the belt to those braces: it still holds if a browser is old, or if a
future change relaxes SameSite for some flow that needs it. **A valid session is not sufficient for
a POST**, and a test asserts that specifically.

The cookie is `HttpOnly` so XSS cannot read it, `Secure` so it never crosses plain HTTP, and scoped
to `Path=/platform` so a gym deployment never receives a platform session even by accident.

**A test failed on the stub, not the code.** The mock response lowercased header names in
`setHeader` but not in `writeHead`, so it stored `Location` while the test read `location`. Node
treats header names case-insensitively; the stub did not. **Fixed the stub** — a test harness that
is less faithful than the runtime produces failures that teach nothing.

**Lesson recorded.** *A rendering decision changed the security model.* Nothing in "use
server-rendered HTML instead of React" announces "you now need CSRF protection", and it would have
been entirely possible to ship the screens without noticing. Worth asking, after any change to how
something is delivered: **what does this change about how it is authenticated?**

---

## 2026-09-21 — Platform screens, where escaping is the whole security story

**Built** `platform/views.js` — login, applications queue, application detail — as server-rendered
HTML. No build step, no second Vite config, no React. **103 tests pass.**

**Why server-rendered rather than React:** the no-cross-imports rule (D-081) means the platform
cannot reuse the gym app's components, so the choice was a second Vite app or plain HTML. For an
internal panel used by one or two people, React buys very little, and **Telga already proves the
pattern next door**.

**Five of the ten tests are XSS cases**, because these pages display text a stranger typed: gym
names, document filenames, rejection reasons. A gym called `<script>alert(1)</script>` is not a
hypothetical — it is the obvious thing to try on a form that a reviewer will later open.

**Staff input is escaped too.** A reviewer typing a rejection reason is still a person typing into a
box, and their text is rendered back on a page. Trusting "internal" input is how internal tools get
compromised.

**No inline event handlers anywhere**, asserted by a test, so a strict Content-Security-Policy stays
possible later without a rewrite.

**Recorded rather than built (D-092).** Reconciliation should run on a daily cron plus a button, but
neither is wired: both need the platform deployment, which waits on the Supabase answer (D-093).
Writing a handler against infrastructure that does not exist would have produced untested code that
looks finished. **An orphaned project costs ~$10/month silently until something runs that job** — so
it is a deployment task, written down, not a loose end.

---

## 2026-09-21 — Application review: the Stage 5 MVP logic is complete

**Built** `platform/applications.js` tests-first. **93 tests pass.** With the schema, provisioning,
reconciliation, management client and auth already done, the MVP scope from D-079 —
**applications and provisioning** — is now complete as logic. Only the screens remain.

**The guard that matters: approving twice must not provision twice.** Approval creates a Supabase
project billed monthly, so a double-click is a double bill. The state machine refuses any decision
on an application that has already been decided, and a test asserts the second approval creates
nothing.

**Two defaults rather than one.** `approveApplication` defaults to a dry run *and* passes that to
the orchestrator, which also defaults to a dry run. Belt and braces, because the consequence of
getting it wrong is money rather than a wrong answer.

**History cannot be rewritten by accident.** The module is handed `appendEvent` and no update or
delete function, so the record of why a gym was let in or turned away is append-only *by
construction*, not by discipline.

**A test was wrong and the code was right.** The first test asserted exactly one event after
approval; the implementation emits two — `approved` then `provisioned`. **The implementation was
better**: they can diverge, because a correct human decision can be followed by a failed provision,
and one combined event would lose that distinction. The test was tightened to assert the sequence
rather than loosened to accept a single event.

**Lesson recorded.** *When a test fails, the code is not automatically the thing that is wrong.*
Both were written minutes apart by the same author; the question is which expresses the requirement
better, not which came first.

---

## 2026-09-21 — Platform authentication, validated against the specifications

**Built** `platform/auth.js` tests-first: passwords, TOTP, recovery codes and platform sessions.
**85 tests pass** with no environment configured.

**TOTP was implemented rather than installed** (D-087), keeping the project at 10 runtime
dependencies. The decision that made that defensible: it is **validated against RFC 6238's own
published test vectors**, and base32 against RFC 4648's. A cryptographic routine tested only against
itself proves nothing except that it is consistently wrong. All six RFC vectors passed on the first
run.

**The test caught a real bug the implementation had.** `otpauthUri` used `URLSearchParams`, which is
**form-encoding** — it turns a space into `+`, and `+` is a literal plus in a URI. "Yoyo Gyms" would
have reached the authenticator app as "Yoyo+Gyms". Rebuilt with `encodeURIComponent`.

**A slow test led to a better security decision** (D-089). Hashing 10 recovery codes with bcrypt at
cost 12 made the suite take **two minutes**. The fix was not to lower the cost but to notice that
**bcrypt was the wrong tool**: its cost factor defends low-entropy *human-chosen* passwords, while a
recovery code here is ~50 bits of randomness. SHA-256 with constant-time comparison is both correct
and fast. Suite went to 22 seconds.

**Lesson recorded.** *Slowness was the symptom; the wrong primitive was the cause.* The tempting fix
— drop the bcrypt cost for tests — would have hidden the real finding and left a misapplied
primitive in production code.

**Second lesson.** The suite failed in a clean environment because the token tests needed
`PLATFORM_JWT_SECRET`, which CI does not set. **Run the suite the way CI runs it, not the way your
shell happens to be configured** — the failure was invisible locally.

---

## 2026-09-21 — The isolation boundary exists, and was tested before it existed

**Stage 4 implemented** (D-076). `server/lib/tenancy.js` resolves a gym to its own database client;
`getSupabase()` returns it. **56 tests pass, production build succeeds.**

**Built tests-first, as instructed.** `tests/isolation.test.js` was written against a module that did
not exist, run and watched fail (`ERR_MODULE_NOT_FOUND`), and only then implemented until green.
The tests landed in the same commit so `main` was never red.

**The design decision that made it cheap: `AsyncLocalStorage`.** The resolved gym lives in
per-request async context rather than a module variable, which gives two things at once —
concurrent requests on one warm serverless instance cannot overwrite each other, and **all ~76
handlers are completely unchanged** because they keep calling `getSupabase()` with no arguments.
The Graphify god-node analysis had already shown that function was the single seam; this is that
finding cashed in.

**Test 6 is the one that matters.** It resolves two gyms concurrently with a deliberate 25 ms skew on
one, then asserts each request still sees its own client. Cache-key confusion under concurrency is
how this design leaks, and it is invisible to single-request testing.

**One behaviour change recorded rather than hidden (D-080).** The Supabase environment check moved
from module load to first call. The original comment said *"fail loud at cold-start rather than
silently mis-querying"* — deliberate, and it had to move: a platform deployment legitimately has no
gym database of its own, so importing the module would have crashed it. A misconfigured single-gym
deployment still fails loudly with the identical message, just on first query.

**Lesson recorded.** *Writing the test against a module that does not exist forces the interface to
be designed from the caller's side.* The dependency injection in `resolveGym` exists because the
test needed two fake gyms and a failing secrets store — not because it was planned. **The test shaped
the design, which is the actual argument for tests-first, not the failing-first ritual.**

---

## 2026-09-21 — Merged to main, and the validator caught its own author

**Merged** `docs/yoyo-gyms-second-brain` into `main` (D-066, `--no-ff`, 25 commits). Not pushed.

**The first thing the validator did on main was fail** — reporting "no YAML frontmatter" on all 22
notes, which plainly had frontmatter. **The bug was mine, not the vault's.** Git checks these files
out as CRLF on Windows, and the frontmatter pattern was anchored to `
`. Line endings are now
normalised on read, and the negative test was re-run against CRLF files to confirm the checks still
fire.

**Lesson recorded.** It would have **passed in CI and failed on every Windows checkout of the same
commit** — Linux runners use LF. A tool that validates text must normalise line endings before it
reads anything, and *"it passes on my machine and in CI"* is not the same as *"it works"* when the
team is on Windows and CI is not.

**Worth noting where it surfaced.** The failure appeared on the merge commit, not on the branch,
because the branch's working files were still the LF versions just written. **Verify after the
merge, not only before it** — the merge changed the bytes on disk.

---

## 2026-09-21 — Graph refresh attempted, deliberately not completed

**Attempted** a Graphify refresh after the day's vault changes. The incremental cache worked well:
of 48 semantic candidates, **30 were cache hits** and only **18 needed re-extraction** — exactly the
notes that had been edited. The AST half (1,314 nodes from 221 code files) ran locally and free.

**The semantic subagent hit the account session limit and died without writing its output.** Unlike
the earlier failure that day, nothing was recovered.

**The graph was deliberately NOT rebuilt.** With those 18 notes uncached and unextracted, a rebuild
would have produced a graph *missing* them entirely — worse than one that is merely out of date.
Partial state was cleared so the next attempt starts clean, and `manifest.json` was left untouched
so the same 18 files are re-detected.

**Lesson recorded.** *A stale artifact beats a confidently incomplete one.* The temptation was to
rebuild with what was available and call the graph refreshed. That would have quietly dropped the
entire vault from the knowledge graph while reporting success. **When a refresh cannot complete,
leave the old version and say so** — the tool's own shrink-guard encodes the same rule.

**Second lesson.** The same subagent failure happened twice in one session. The first time the work
had landed on disk and only the report was lost; the second time nothing landed. **"The agent
failed" and "the work is gone" are different claims** — check the artifact before assuming either.

---

## 2026-09-21 — The vault now validates itself

**Added `npm run docs:validate`** (`scripts/validate-vault.mjs`, 150 lines) and wired it into CI
between the unit tests and the production build. **D-064.**

**What it checks, and why each one is there.** Every check corresponds to a mistake actually made
during this session, not a hypothetical:

| Check | The real incident it prevents |
|---|---|
| Frontmatter keys present | Note 01 had no `updated` field — found on the first run |
| Wikilinks resolve **through aliases** | The numbered-filename / titled-link split (D-006) only works if aliases resolve; a plain filename check would have reported 60+ false breaks |
| Orphans | A note nothing links to is a note nobody finds |
| `D-###` references exist in the Decision Log | Dangling decision references are worse than none — they look authoritative |
| Mojibake | Encoding damage from a bad write |

Code fences and inline code are stripped before links are read, because the Decision Log genuinely
contains a `[[links]]` written as an example. A naive scanner would have flagged it forever.

**Proven, not assumed.** The validator was negative-tested against a deliberately broken note —
removed frontmatter key, link to a non-existent note, and a reference to `D-999`. All three were
caught, exit code 1, and the note restored cleanly. A checker nobody has seen fail is a checker
nobody should trust.

**Why this existed to be built.** Stale or self-contradicting vault content was fixed **by hand five
times** on 2026-09-21: note 11 listing answered questions as open, note 14 contradicting the routing
decision, note 17 twice, note 07 still claiming nothing was decided after four decisions had been
made. None of those were carelessness — they are what happens when 22 cross-linked notes and 64
decisions move quickly. The vault is the memory of record, so drift should fail a build rather than
wait to be noticed by whoever reads the note next.

**Lesson recorded.** The pattern came from Telga (`npm run docs:validate`, D-052). **Looking at what
the neighbouring project already solved was cheaper than inventing it** — including the two details
that are easy to get wrong: stripping code spans before reading links, and resolving through
aliases.

---

## 2026-09-21 — Member payments removed (first code change of the project)

**Implemented** [[21 - Member Payment Removal Design]] end to end. **49 tests pass** (42 + 7 new),
**production build succeeds**. 9 files deleted, 11 changed, 2 added. The schema was not touched, no
migration was written, and `server/lib/paystack.js` survives for platform billing (D-021).

**The order was the safety property, and it was followed.** Activation was wired into manual capture
and verified with tests *before* a single file was deleted. Reversed, every newly registered member
would have been stranded at `status:'new'`.

**Two pre-existing bugs surfaced (D-032), both invisible because no gym is live:**

1. `activation.js` wrote `paystack_auth_code` to the **`payments`** table — a column that exists
   only on `memberships` — and **never checked the error**. It failed silently, so the payment row
   never actually became `received`, which meant the idempotency guard could never trip. Fixed in
   the rewrite; the new code checks every error and returns `{activated, error}` instead of
   swallowing failures.
2. `admin/payments.js` PATCH writes `refunded_amount`, which exists on no table, so **refunds error
   out**. **Left alone** — outside this change's scope. Raised as Q-45 for a separate decision.

**Lesson recorded.** Both bugs were found by checking column names against `db/schema.sql` instead
of trusting that working-looking code touches columns that exist. **An unchecked `error` on a
Supabase write is indistinguishable from success** — the first bug had been sitting in the most
safety-critical function in the payment path. When rewriting a function, verify its writes against
the schema, and never leave an error unchecked.

**One design change during implementation (D-030).** `retry-suspend.js` suspended members when
`payments.status = 'failed'`, which only Paystack retries ever set. Removing Paystack would have
left that trigger permanently unreachable — dead code that never fires. It became
`suspend-overdue.js` with a real trigger (billing date past a grace window, no payment captured),
**opt-in per gym and off by default** (D-028), so no gym inherits a policy it did not choose.

**`billing.js` split exactly as predicted**, which was the point of refusing to delete it: its
Paystack debit went, its reminder job stayed.

---

## 2026-09-21 — Stage 3 CLOSED; payment-removal design delivered

**D-022.** The platform data model is **approved** with twelve binding conditions. Note 12 is marked
approved-but-not-built: **no table exists and no migration has been written.**

**Payment-removal design** written to [[21 - Member Payment Removal Design]] (D-023 extends the §28
vault structure by one note). Inventory from `grep`, not recall: **21 files** reference Paystack —
6 to delete, 9 to change, the rest untouched. **No existing test touches payments**, so the change
currently has zero coverage and six new tests are specified.

**Three findings that changed the design, each from reading the code rather than assuming:**

1. **The no-payment path already exists.** `Register.jsx:55-62` already routes *staff* registrations
   straight to the success screen, taking payment offline. The removal is largely "make every
   registration take the branch that already works" — a much smaller, safer change than it sounded.
2. **`billing.js` must be split, not deleted.** It exports two functions. `run()` charges via
   Paystack; **`runReminders()` touches no Paystack at all** — it reads `next_billing_date` and
   emails members three days ahead. Deleting the file to remove Paystack would have silently killed
   billing reminders for gyms collecting cash.
3. **`retry-suspend.js` couples Paystack retry with overdue suspension.** Suspension is valuable to
   a cash-collecting gym and arguably inside the preserved "arrears" scope. Opened as Q-42 rather
   than decided.

**The sequence is the safety property.** Activation must be wired into manual capture and verified
*before* anything is removed. Reversed, every newly registered member is stranded at `status:'new'`
with nothing able to activate them. Written into the note as step 1 of 6.

**Lesson recorded.** "Delete the Paystack files" would have been a defensible reading of the
instruction and would have broken two unrelated things — billing reminders and overdue suspension —
because **a file named after one job was doing two.** Enumerate a file's exports before deleting it
for its name.

**Q-41 (Telga) closed as out of scope by instruction** (D-024): unresolved, and explicitly **not a
confirmed dependency**. Nothing in the architecture references it.

---

## 2026-09-21 — Stage 3 opened: platform data model designed

**Delivered.** 14 platform tables proposed in [[12 - Database Architecture]] §4, in a **separate
`platform` schema in a separate Supabase project**. Tenant-resolution chain documented in
[[06 - Tenant Architecture]] §6c, platform roles in [[13 - Authentication and Roles]], risks in
[[14 - Security and Privacy]]. **Design only — no migration file, no SQL executed, and the existing
24 single-gym tables were not touched.**

**Two invariants written into the design, not left implicit:**

1. **The platform database holds no member data** — no names, health answers, biometric templates
   or payments. That is what keeps D-014's POPIA position intact, and it is an invariant rather
   than a convention.
2. **`gym_secrets` holds pointers, never values.** A database constraint cannot enforce "this text
   is not a secret", so it is a documented invariant plus a code-review rule, and any violation is
   an incident requiring rotation rather than a row deletion.

**The trade-off stated rather than buried.** D-016 gives physical *data* isolation but makes the
*application* a shared trust boundary: one compromised process can reach every gym's credentials,
where deployment-per-gym would have reached one. Recorded as R-1…R-10 so the cost of the chosen
model is findable later, not rediscovered after an incident.

**D-020 / D-021 — Paystack, reversed.** The user set the platform billing provider to Paystack for
**gym→platform subscriptions**. This produced a non-obvious implementation consequence worth
recording: **`server/lib/paystack.js` must not be deleted** during the member-payment removal
(D-018). The same library is needed platform-side, and it already carries proven webhook hardening
(HMAC plus independent re-verification). Paystack leaves the member-facing app and reappears on the
platform side — same library, opposite direction of money.

**Lesson recorded.** "Remove Paystack" and "use Paystack" arrived four messages apart and are both
correct, because they concern different money flows. **Before deleting an integration, ask which
direction the money was going** — the instruction to remove it did not mean the code had no other
use.

**Q-41 opened rather than guessed.** The instruction read *"the gym subscribe my telga so use
paystack for it"*. The Paystack half was unambiguous and became D-020; "telga" is a separate
project folder on this machine, appears nowhere in this repository, and was **not** interpreted.

---

## 2026-09-21 — Stage 1 CLOSED: the tenancy model is decided

**D-016.** Model C approved: **one shared application deployment + one Supabase project per gym**,
with gym resolution injected at `getSupabase()`, a per-gym secrets store and an orchestrated
migration runner. Stages 0, 1 and 2 are now closed. Stage 3 is unblocked.

**Also decided:** manual cash/EFT capture will activate the member (D-017, closing the Q-34 gap);
the online card path goes but payment tracking stays (D-018, *inferred* — see Q-39); and **no gym
is live yet** (D-019), so the payment removal is a clean deletion with no flag, no cutover and no
in-flight-transaction migration.

**The risk that was accepted, not resolved.** The user approved D-016 outright rather than pending
**U-1** — the maximum number of Supabase projects per organisation, which Supabase does not
document. **Both D-016 and D-014 rest on there being no ceiling below the target.** This is now the
single highest-priority open item and should be settled by asking Supabase directly, not by
inference. Recorded so that if the architecture is ever revisited, the reason is findable.

**Lesson recorded.** Two of the four answers in this round were free text that did not match any
offered option, and one of them (Q-35) had to be *interpreted* to be actionable. The interpretation
was written into D-018 **labelled as an inference**, with a confirmation question (Q-39) rather than
being quietly adopted as fact. **When a decision is inferred rather than stated, say so in the
record and ask** — an unmarked inference in a decision log is indistinguishable from a decision the
next time someone reads it.

---

## 2026-09-21 — Four decisions, and a gap caught before implementation

**User answered the blocking questions** (D-012 … D-015): thousands of gyms in 24 months is a
**real plan**; the platform takes a **flat subscription from gyms only** and never touches member
money; **each gym must have its own database**; and **member payments are removed from the product
entirely**.

**Model B is ruled out** by the own-database requirement. Q-01 narrowed to A vs C, with a
recommendation recorded in [[06 - Tenant Architecture]] §6b.

**The gap caught.** Before writing up the payment removal, a check of the actual code found that
`admin/payments.js` POST — "record manual (cash/EFT) payment" — inserts a `payments` row and
**never touches `members.status` or `memberships.state`**. `activatePayment()` is called from
exactly two places, both Paystack. **So removing Paystack removes the only automatic path from
`status:'new'` to `active`, and a newly registered member would be stranded forever.** Logged as
Q-34, blocking any payment-code removal.

**Lesson recorded.** The decision "remove member payments" sounds like a deletion. It is actually a
change to the *membership lifecycle*, because activation was coupled to payment. **Ask what a
removal was silently holding up before removing it** — the failure protocol working as intended,
one stage earlier than usual.

**Second insight, from the graph.** The god-node analysis put `getSupabase()` at 159 edges: every
one of ~76 handlers reaches the database through that one function. Gym resolution can therefore be
injected at a **single point**, leaving all 24 tables and every handler untouched. That is what
makes a shared-application / per-gym-database model tractable, and it is the most useful
implementation fact Graphify surfaced.

---

## 2026-09-21 — Git commit, Graphify, Stage 1 comparison

**Committed.** `vault/`, `CLAUDE.md` and `.gitignore` on branch `docs/yoyo-gyms-second-brain`
(23 files, 3,257 insertions). Excluded and now git-ignored: `.obsidian/` (29 MB of vendored plugin
code, machine-specific layout, and plugin data including `remotely-save` cloud-sync credentials),
`.smart-env/` (13 MB private embeddings index), `graphify-out/` (regenerable). Secret scan over the
committed files: clean.

**Graphify built** (v0.9.65, no `--obsidian` — the curated vault must not be overwritten):
274 files → **1,550 nodes, 4,581 edges, 92 communities**. 1,313 AST + 216 semantic nodes.
`graphify-out/` holds `graph.html`, `graph.json`, `GRAPH_REPORT.md`.

**Two process notes recorded honestly:**

1. **SQL was silently missing.** The first AST pass warned that 14 `.sql` files — `schema.sql` and
   every migration — "contributed nothing" because `tree_sitter_sql` was absent. Installing
   `graphifyy[sql]` and re-running added **+119 nodes**. Without that warning the graph would have
   had a hole exactly where this project's core is. **Read the tool's warnings.**
2. **One of four extraction subagents hit a session rate limit** and never delivered its report.
   Its chunk file *had* already been written and covered all 17 of its files — verified by counting
   nodes per `source_file` before using it. **A missing report is not the same as missing work;
   check the artefact, not the messenger.**

**Graph health:** 15 dangling-endpoint edges (0.3%), 2 self-loops, 70 collapsed multi-relation
pairs (expected in an undirected build). Surfaced rather than hidden.

**Stage 1 documentation** (comparison only, no model chosen) written into
[[06 - Tenant Architecture]] across all 16 requested dimensions.

**The find of the session — and Graphify earned its keep.** The graph surfaced a
`semantically_similar_to` edge between *Tenancy Models A/B/C* (vault) and *Single-Tenant Commercial
Model* (`Yoyo-GYM-Business-Master-Guide.pdf`) that prose review had missed entirely. Following it
and **verifying the source** at `scripts/business-guide.js:157-162` found a deliberate, documented
legal posture: each gym uses **its own Paystack account** ("you never handle their members' money or
carry financial liability"), **ideally its own Supabase project**, and **the gym is the POPIA
responsible party while MuleSoo is the processor**. Model B reverses all three. That constraint was
invisible in the code and would have been missed by a purely technical comparison.

**Verified vendor limits** (official docs, not memory): Vercel allows **150 Vercel projects per Git
repository on Pro** — a hard blocker for the documented "one repo, many Vercel projects" model at
10,000 gyms — and Supabase bills **dedicated compute per project**, so cost is linear with a
per-gym floor. Also found: **the cron constraint baked into this codebase is obsolete** — Vercel
moved to 100 cron jobs per project on every plan in January 2026, so the "Hobby-plan friendly"
3-of-8 scheduling reflects the old 2-per-team limit. Recorded, not changed (§32).

---

## 2026-09-21 — Stage 2: vault foundation

**Done.** Created notes 02–16, 19, 20 (this note), completing the §28 structure begun with 00, 01,
17, 18. Resolved open questions Q-25 → Q-29 from repository evidence. No source code, database,
migration, configuration, authentication or deployment change.

**Resolved from code:**

| # | Question | Answer |
|---|---|---|
| Q-25 | Is `IdPhotoStep.jsx` dead code? | **No — live.** Imported and rendered by `Controls.jsx:10,32` for control type `'face'`. Its purpose: every membership card must carry a photo, so a member declining the biometric still uploads one |
| Q-26 | What activates a member? | **`activatePayment()`** (`server/lib/activation.js`), idempotent, called by exactly two callers — `payments/verify.js` and `payments/webhook.js`. Plus a manual admin override, `PATCH /api/admin/member` with `{status}`, audited |
| Q-27 | Are `settings` keys documented? | **No.** Free-form key/value store, no validation, no enumerated list. Confirmed keys in use: `gym_profile`, `contract_discounts`, `compliance` |
| Q-28 | Are the `qr/` assets current? | **Yes — deliberate.** Generated by `scripts/generate-qr.js`, which is **separate** from runtime generation and uses a **hardcoded** `https://yoyogym.vercel.app/`. Single-gym by construction |
| Q-29 | Are staff on the door scanner? | **No.** `access-card.js` branches on `member` / `trainer` only; `resolve-member.js` queries `members` then `trainers`. `admin_users` is never matched |

**Lesson recorded.** Q-25 and Q-28 were both listed as "possibly dead code" in
[[01 - Existing Yoyo Gym Audit]] on the basis of a *missing reference*. Both turned out to be live.
**Absence of an obvious call site is not evidence of dead code** — trace imports before concluding.

---

## 2026-09-21 — Stage 2: first audit note

**Done.** Created [[01 - Existing Yoyo Gym Audit]] (517 lines) plus [[00 - Project Purpose]],
[[17 - Open Questions]], [[18 - Decision Log]]. Evidence: full repository inspection at commit
`c68c8c9`; `npm test` run → **42 tests, 42 pass, 0 fail**.

**Conflicts found and handled:** the `document.js` comment/route mismatch (documented, not
"fixed"); the vault link-vs-filename conflict (resolved with YAML aliases, D-006).

---

## 2026-09-21 — Stage 0: CLAUDE.md v2

**Done.** Wrote `CLAUDE.md` at the repository root and verified it against the code before
approval. `CLAUDE (3).md` left untouched as the v1 spec.

**Three errors caught pre-approval** — they originated in the discovery report and would have
become source-of-truth defects:

1. **25 tables → 24** (the list was right, the count wrong)
2. **24 guarded admin routes → 23** (plus an unguarded `/admin/login`)
3. Store compliance referenced Stage 9 → corrected to **Stage 10**

**Lesson recorded.** A count asserted in prose and a list enumerated beside it disagreed, and the
prose was believed. **Count the list, don't trust the summary** — `grep -c` is cheaper than a wrong
source of truth.

**Also corrected.** `session-progress.md` in Claude's memory claimed HEAD `74d4646` and 19 tests;
actual `c68c8c9` and 42 tests. Memory annotated as stale and non-authoritative (`CLAUDE.md` §29).

---

## 2026-09-21 — Stage 0: discovery

**Done.** Full repository inspection. Searched for the previous single-gym discovery result across
the repository, this vault, git history (added *and* deleted files) and the user's home directory.
**Not found.** Declared permanently absent by the user (D-002).

**Established.** The vault *is* the repository root. Graphify is a **CLI** (`graphifyy 0.9.65`),
not an Obsidian plugin; never run on this project. `.obsidian/` and `.smart-env/` are untracked
(Q-23, still open).

---

## Related

[[00 - Project Purpose]] · [[18 - Decision Log]] · [[19 - Implementation Phases]] ·
[[17 - Open Questions]] · [[01 - Existing Yoyo Gym Audit]]
