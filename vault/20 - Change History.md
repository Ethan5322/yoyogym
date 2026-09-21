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
