---
aliases: ["Decision Log", "Decisions"]
tags: [decisions, log]
stage: "Stage 2"
status: active
updated: 2026-09-21
---

# 18 — Decision Log

Append-only. One row per decision, newest first. A decision enters this log **only after the user
has approved it**. Proposals live in [[17 - Open Questions]] until then.

Per `CLAUDE.md` §29, an approved decision recorded here outranks repository behaviour for *future*
work — but never rewrites what the code actually does today ([[01 - Existing Yoyo Gym Audit]]).

| # | Date | Decision | Rationale | Affects |
|---|---|---|---|---|
| D-008 | 2026-09-21 | Notes about **future** work (04, 05, 06, 07, 10, 11, 15) are marked `status: requirements-only` / `provisional-only` / `undecided` in frontmatter and state explicitly that they contain no decisions | Prevents a later session mistaking a written requirement for an approved design — the failure mode `CLAUDE.md` §29 warns about | Notes 04–15 |
| D-007 | 2026-09-21 | **Vault structure confirmed** as the 21 notes of `CLAUDE.md` §28, in `vault/`, all carrying YAML `aliases:` and linking back to 00 / 01 / 17 / 18 | Stage 2 structure approved by the user; Graphify may run against it once the user authorises | Whole vault |
| D-006 | 2026-09-21 | Vault notes use **numbered filenames** (`01 - …`) per `CLAUDE.md` §28, **plus a YAML `aliases:`** entry carrying the bare title, so both `[[01 - Existing Yoyo Gym Audit]]` and `[[Existing Yoyo Gym Audit]]` resolve | §27 link names and §28 filenames conflicted; aliases satisfy both without renaming either | All vault notes |
| D-005 | 2026-09-21 | Vault notes live in **`vault/`** at the repository root, not scattered at root level | Keeps 21 planned notes out of the source tree; Obsidian resolves `[[links]]` vault-wide regardless of folder. Renameable later at no cost | Vault structure |
| D-004 | 2026-09-21 | **Proceed to Stage 2 (audit note) before Stage 1 (tenancy)** — a deliberate reordering of `CLAUDE.md` §34 | The user wants the existing system documented before architecture is chosen, so the tenancy decision is made against written evidence rather than recollection | [[19 - Implementation Phases]] |
| D-003 | 2026-09-21 | The **repository inspection of 2026-09-21 is the source of truth** for existing single-gym behaviour, recorded in [[01 - Existing Yoyo Gym Audit]] | The prior audit is gone; code is the only remaining primary evidence | All future work |
| D-002 | 2026-09-21 | The previous single-gym discovery result is **permanently absent**. Do not reconstruct or fabricate it | Searched repo, vault, git history (added and deleted files) and the home directory — it does not exist on this machine | `CLAUDE.md` §29 |
| D-001 | 2026-09-21 | **`CLAUDE.md` v2 approved as written**, after three verified corrections (24 tables not 25; 23 guarded routes not 24; store compliance is Stage 10 not Stage 9) | Errors originated in the discovery report and would have become source-of-truth defects | `CLAUDE.md` §6, §8, §19 |

## Standing rules carried from `CLAUDE.md`

- **Memory of record** — this vault plus Graphify, never chat history (§26)
- **Failure protocol** — investigate from notes, logs and code; never guess (§27.1)
- **Stage gating** — one stage open at a time; the gate is the user's word (§34)
- **Protected surface** — nothing in [[03 - Protected Existing Functions]] changes without an
  explicit approved decision recorded here (§32)

## Rejected ideas

*(none yet — record rejections here with the reason, so they are not re-proposed)*

## Related

[[00 - Project Purpose]] · [[01 - Existing Yoyo Gym Audit]] · [[17 - Open Questions]] ·
[[19 - Implementation Phases]] · [[20 - Change History]] · [[03 - Protected Existing Functions]]
