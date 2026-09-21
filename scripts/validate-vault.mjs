/**
 * Vault validator — keeps the second brain honest.
 *
 * The Obsidian vault in `vault/` is this project's memory of record
 * (`CLAUDE.md` §26). A note that quietly goes stale or loses a link is exactly
 * how a future session reaches a wrong answer with confidence, so the checks
 * below are the ones that caught real problems by hand during the 2026-09-21
 * session:
 *
 *   1. Frontmatter — every note carries the keys the vault relies on.
 *   2. Wikilinks resolve — to a filename OR to an alias, because notes are
 *      numbered (`01 - Existing Yoyo Gym Audit`) while links are often written
 *      by title (`[[Existing Yoyo Gym Audit]]`). That is D-006, and it only
 *      works if aliases are honoured.
 *   3. Orphans — a note nothing links to is a note nobody will find.
 *   4. Decision references — every `D-###` mentioned anywhere exists in the
 *      Decision Log. A dangling decision reference is worse than no reference.
 *   5. Mojibake — encoding damage from a bad write (â€, Ã©, Â·).
 *
 * Errors fail the run. Orphans and unknown question references are warnings:
 * both are sometimes legitimate, so they are surfaced rather than enforced.
 *
 * Usage:  npm run docs:validate
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const VAULT = join(ROOT, 'vault');

const REQUIRED_KEYS = ['aliases', 'tags', 'stage', 'status', 'updated'];

/** The graph root: linked FROM everywhere, so it needs no inbound link itself. */
const ROOT_NOTES = new Set(['00 - Project Purpose']);

/** Encoding damage: UTF-8 bytes read as Latin-1 and written back. */
const MOJIBAKE = /â€|Ã[\u0080-¿]|Â[\u0080-¿]/;

/**
 * Code fences and inline code are stripped before links are read, so a
 * `[[links]]` written as an example inside backticks is not mistaken for a
 * real link. The Decision Log genuinely contains one.
 */
const stripCode = (text) => text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');

const LINK = /\[\[([^\]|#]+)/g;
const DECISION_REF = /\bD-(\d{3})\b/g;
const QUESTION_REF = /\b([QU])-(\d{1,3})\b/g;

const notes = readdirSync(VAULT)
  .filter((f) => f.endsWith('.md'))
  .sort();

const errors = [];
const warnings = [];

/** name (lowercased) -> note filename stem, for both stems and aliases. */
const resolvable = new Map();
const incoming = new Map();
const bodies = new Map();

// ---- pass 1: frontmatter, aliases, mojibake -------------------------------
for (const file of notes) {
  const stem = file.replace(/\.md$/, '');
  // Normalise line endings before anything else. Git checks these files out as
  // CRLF on Windows, and a frontmatter pattern anchored to "\n" silently sees
  // no frontmatter at all — it passed on Linux CI and failed on a Windows
  // checkout of the same commit.
  const raw = readFileSync(join(VAULT, file), 'utf8').replace(/\r\n/g, '\n');
  incoming.set(stem, 0);

  if (MOJIBAKE.test(raw)) {
    errors.push(`${file}: encoding damage (mojibake) — rewrite the file as UTF-8`);
  }

  const fm = /^---\n([\s\S]*?)\n---/.exec(raw);
  if (!fm) {
    errors.push(`${file}: no YAML frontmatter`);
    bodies.set(stem, raw);
    resolvable.set(stem.toLowerCase(), stem);
    continue;
  }

  for (const key of REQUIRED_KEYS) {
    if (!new RegExp(`^${key}:`, 'm').test(fm[1])) {
      errors.push(`${file}: frontmatter missing "${key}"`);
    }
  }

  resolvable.set(stem.toLowerCase(), stem);

  // aliases: ["A", "B"]  — the mechanism D-006 depends on.
  const aliasLine = /^aliases:\s*\[(.*)\]/m.exec(fm[1]);
  if (aliasLine) {
    for (const alias of aliasLine[1].matchAll(/"([^"]+)"|'([^']+)'/g)) {
      const name = (alias[1] || alias[2]).trim();
      if (name) resolvable.set(name.toLowerCase(), stem);
    }
  }

  bodies.set(stem, raw.slice(fm[0].length));
}

// ---- pass 2: links, decision refs, question refs ---------------------------
const decisionLog = bodies.get('18 - Decision Log') ?? '';
const knownDecisions = new Set([...decisionLog.matchAll(DECISION_REF)].map((m) => m[1]));

const openQuestions = bodies.get('17 - Open Questions') ?? '';
const knownQuestions = new Set(
  [...openQuestions.matchAll(QUESTION_REF)].map((m) => `${m[1]}-${Number(m[2])}`)
);

for (const [stem, body] of bodies) {
  const text = stripCode(body);

  for (const match of text.matchAll(LINK)) {
    const target = match[1].trim();
    const hit = resolvable.get(target.toLowerCase());
    if (!hit) {
      errors.push(`${stem}: broken link [[${target}]]`);
    } else if (hit !== stem) {
      incoming.set(hit, (incoming.get(hit) ?? 0) + 1);
    }
  }

  for (const match of text.matchAll(DECISION_REF)) {
    if (stem === '18 - Decision Log') break;
    if (!knownDecisions.has(match[1])) {
      errors.push(`${stem}: references D-${match[1]}, which is not in the Decision Log`);
    }
  }

  for (const match of text.matchAll(QUESTION_REF)) {
    if (stem === '17 - Open Questions' || stem === '18 - Decision Log') break;
    const ref = `${match[1]}-${Number(match[2])}`;
    if (!knownQuestions.has(ref)) {
      warnings.push(`${stem}: references ${ref}, which is not in Open Questions`);
    }
  }
}

// ---- pass 3: orphans -------------------------------------------------------
for (const [stem, count] of incoming) {
  if (count === 0 && !ROOT_NOTES.has(stem)) {
    warnings.push(`${stem}: orphan — no other note links to it`);
  }
}

// ---- report ----------------------------------------------------------------
const uniq = (a) => [...new Set(a)];
const errs = uniq(errors);
const warns = uniq(warnings);

console.log(`Vault: ${notes.length} notes, ${resolvable.size} resolvable names\n`);

if (warns.length) {
  console.log(`Warnings (${warns.length}):`);
  for (const w of warns) console.log(`  ~ ${w}`);
  console.log('');
}

if (errs.length) {
  console.log(`Errors (${errs.length}):`);
  for (const e of errs) console.log(`  x ${e}`);
  console.log('\nVault validation FAILED.');
  process.exit(1);
}

console.log(warns.length ? 'Vault validation passed (with warnings).' : 'Vault validation passed.');
