// Build platform/RUN-THIS.sql from the two files that own the SQL.
//
// One source of truth, not three copies drifting apart. Run after editing
// either schema.sql or seed.sql.
import { readFileSync, writeFileSync } from 'node:fs';

const HEADER = `-- =============================================================================
-- YOYO GYMS — RUN THIS ONE FILE
-- =============================================================================
-- Generated from platform/schema.sql + platform/seed.sql by
--   npm run sql:bundle
-- Edit THOSE files, never this one.
--
-- WHERE:  your EXISTING Supabase project (the one the gym already uses).
--         Every gym is a schema in one project (D-096) — do NOT make a new one.
--
-- SAFE:   creates only the \`platform\` schema. Your gym's 24 tables live in
--         \`gym\` and are never named, altered, dropped or read by this file.
--         Every statement is \`if not exists\`, so running it twice is safe.
--
-- BEFORE: replace BOTH copies of CHANGE-ME@example.com near the bottom.
-- AFTER:  Settings → API → Exposed schemas → ADD \`platform\` to the list.
--         Do not replace the list — removing \`gym\` stops your gym serving.
-- =============================================================================

`;

const schema = readFileSync('platform/schema.sql', 'utf8');
const seed = readFileSync('platform/seed.sql', 'utf8');

writeFileSync('platform/RUN-THIS.sql', HEADER + schema + '\n\n' + seed, 'utf8');
console.log(`platform/RUN-THIS.sql rebuilt (${(HEADER + schema + seed).split('\n').length} lines)`);
