// The platform SQL, checked as text before anybody pastes it.
//
// This file exists because of a question asked before the first run: does the
// platform SQL affect the gym data already in Supabase? The answer has to be
// provable, and it has to STAY true as the schema grows — which is what these
// assertions are for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const schema = readFileSync('platform/schema.sql', 'utf8');
const seed = readFileSync('platform/seed.sql', 'utf8');

/** SQL with comments and string literals removed, so only real code is left. */
const code = (sql) =>
  sql
    .split('\n')
    .map((l) => l.split('--')[0])
    .join('\n')
    .replace(/'[^']*'/g, "''");

// ---------------------------------------------------------------------------
// It must never touch the existing gym
// ---------------------------------------------------------------------------

test('THE PLATFORM SQL NEVER REFERENCES THE GYM SCHEMA', () => {
  // The gym's 24 tables live in `gym`. Everything here lives in `platform`.
  for (const [name, sql] of [['schema.sql', schema], ['seed.sql', seed]]) {
    assert.ok(!/\bgym\.\w/.test(code(sql)), `${name} must not name a gym-schema object`);
  }
});

test('NOTHING IS DROPPED, TRUNCATED OR DELETED', () => {
  for (const [name, sql] of [['schema.sql', schema], ['seed.sql', seed]]) {
    const c = code(sql);
    assert.ok(!/\bdrop\s+(table|schema|database|column)\b/i.test(c), `${name} must not drop anything`);
    assert.ok(!/\btruncate\b/i.test(c), `${name} must not truncate`);
    assert.ok(!/\bdelete\s+from\b/i.test(c), `${name} must not delete rows`);
  }
});

test('every create is guarded, so running it twice is safe', () => {
  const creates = code(schema).match(/create\s+(table|index|unique index|schema|extension)\b[^;]*/gi) || [];
  for (const c of creates) {
    assert.match(c, /if not exists/i, `unguarded: ${c.slice(0, 70)}`);
  }
});

test('the seed only ever writes to platform tables', () => {
  const targets = [...seed.matchAll(/insert\s+into\s+([\w.]+)/gi)].map((m) => m[1]);
  assert.ok(targets.length > 0);
  for (const t of targets) {
    assert.match(t, /^platform\./, `${t} is not a platform table`);
  }
});

// ---------------------------------------------------------------------------
// It must protect itself
// ---------------------------------------------------------------------------

test('EVERY platform table has row level security enabled', () => {
  // Caught a real gap: member_directory was added late and had none, which
  // would have left it readable once the schema was exposed to PostgREST.
  const tables = [...schema.matchAll(/create table if not exists platform\.(\w+)/gi)].map((m) => m[1]);
  const rls = [...schema.matchAll(/alter table (?:platform\.)?(\w+)\s+enable row level security/gi)].map((m) => m[1]);

  const missing = tables.filter((t) => !rls.includes(t));
  assert.deepEqual(missing, [], `tables without RLS: ${missing.join(', ')}`);
  assert.ok(tables.length >= 18);
});

test('it creates its own schema and does not assume one exists', () => {
  assert.match(schema, /create schema if not exists platform;/i);
});
