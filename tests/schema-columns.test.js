// Every column a query names must exist in the table it queries.
//
// PostgREST does not throw on an unknown column — it returns an error object,
// and code that only reads `data` sees an empty result. That is how three
// features failed silently from the day they were built:
//
//   · members.data_deletion_requested was never created, so every member's
//     "Request data deletion" failed;
//   · the platform read checkins.created_at, which does not exist, so every
//     gym's "check-ins this month" and "last activity" were blank;
//   · /api/health counted settings.id, which does not exist, so it reported a
//     healthy database as "DB error".
//
// The unit tests all passed, because their fake databases accepted any name.
// This test reads the real schema instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// ---- the schema ---------------------------------------------------------------
const columns = new Map();
const add = (table, column) => {
  if (!columns.has(table)) columns.set(table, new Set());
  columns.get(table).add(column);
};

const sqlFiles = [
  'db/schema.sql',
  'platform/schema.sql',
  ...fs.readdirSync('db/migrations').map((f) => `db/migrations/${f}`),
  ...fs.readdirSync('platform/migrations').filter((f) => f.endsWith('.sql')).map((f) => `platform/migrations/${f}`),
];
const TYPES = 'uuid|text|integer|int|bigint|boolean|timestamptz|timestamp|date|time|numeric|jsonb|json|citext|smallint|real|double|serial|bigserial';

for (const file of sqlFiles) {
  const sql = fs.readFileSync(file, 'utf8').replace(/--.*$/gm, '');
  for (const m of sql.matchAll(/create table if not exists (?:\w+\.)?(\w+)\s*\(([\s\S]*?)\n\);/gi)) {
    for (const line of m[2].split('\n')) {
      const c = line.trim().match(new RegExp(`^([a-z_][a-z0-9_]*)\\s+(${TYPES})\\b`, 'i'));
      if (c) add(m[1], c[1]);
    }
  }
  for (const m of sql.matchAll(/alter table (?:if exists )?(?:\w+\.)?(\w+)([\s\S]*?);/gi)) {
    for (const c of m[2].matchAll(/add column (?:if not exists )?([a-z_][a-z0-9_]*)/gi)) add(m[1], c[1]);
  }
}

// ---- the code -------------------------------------------------------------------
const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.js') ? [path.join(dir, e.name)] : []);

/**
 * Known and recorded, not forgotten. Each entry says why it is here.
 */
const KNOWN = new Set([
  // Project mode (a gym with its own Supabase) is unwired: gym_secrets holds
  // REFERENCES into a secrets manager by design (platform/schema.sql), never
  // key values. Recorded in vault/20; no gym uses project mode.
  'gym_secrets.service_role_key',
  'gym_secrets.anon_key',
]);

function findUnknownColumns() {
  const problems = [];
  const FILTERS = /\.(eq|neq|gt|gte|lt|lte|like|ilike|is|in|order|contains)\(\s*'([a-z_][a-z0-9_]*)'/g;

  for (const file of [...walk('server'), ...walk('platform')]) {
    const source = fs.readFileSync(file, 'utf8');
    for (const m of source.matchAll(/\.from\(\s*'([a-z_]+)'\s*\)/g)) {
      const table = m[1];
      // The chain: this line after .from(...), plus following lines that
      // continue it (start with `.`). Stops before an unrelated query.
      const rest = source.slice(m.index + m[0].length);
      const lines = rest.split('\n');
      let chain = lines[0];
      for (let i = 1; i < lines.length && /^\s*\./.test(lines[i]); i++) chain += '\n' + lines[i];
      chain = chain.split(/\.from\(/)[0];

      const known = columns.get(table);
      if (!known) { problems.push(`${file}: table "${table}" is in no schema`); continue; }

      const check = (column, how) => {
        if (known.has(column) || KNOWN.has(`${table}.${column}`)) return;
        problems.push(`${file}: ${table}.${column} (${how})`);
      };

      for (const sel of chain.matchAll(/\.select\(\s*'([^']*)'/g)) {
        for (let c of sel[1].replace(/\w+\s*\([^)]*\)/g, '').split(',')) {
          c = c.trim().split(':').pop().trim();
          if (c && c !== '*' && /^[a-z_][a-z0-9_]*$/.test(c)) check(c, 'select');
        }
      }
      for (const f of chain.matchAll(FILTERS)) check(f[2], `.${f[1]}`);
      for (const u of chain.matchAll(/onConflict:\s*'([a-z_]+)'/g)) check(u[1], 'onConflict');
    }
  }
  return problems;
}

test('EVERY COLUMN A QUERY NAMES EXISTS IN ITS TABLE', () => {
  assert.ok(columns.size > 30, 'the schema was read');
  assert.deepEqual(findUnknownColumns(), []);
});

test('the three columns that failed silently are now real', () => {
  assert.ok(columns.get('members').has('data_deletion_requested'));
  assert.ok(columns.get('checkins').has('checked_in_at'));
  assert.ok(!columns.get('checkins').has('created_at'), 'and the one read by mistake still does not exist');
  assert.ok(columns.get('settings').has('key'));
});

test('the bundled gym schema matches db/schema.sql', async () => {
  // Provisioning uses db/schema.sql.js; a stale bundle would build new gyms
  // without the deletion column.
  const { GYM_SCHEMA_SQL } = await import('../db/schema.sql.js');
  assert.equal(GYM_SCHEMA_SQL, fs.readFileSync('db/schema.sql', 'utf8'));
});
