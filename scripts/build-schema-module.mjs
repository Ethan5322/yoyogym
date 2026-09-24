// Turn db/schema.sql into a JavaScript module.
//
// WHY THIS EXISTS, rather than just reading the file at runtime:
//
// platform/schema-runner.js needs the gym schema in order to provision a gym.
// It used to read it with readFileSync, which works locally and FAILS SILENTLY
// ON VERCEL — Vercel bundles what it can trace through imports, and a
// readFileSync is not an import. In production the file would simply not be
// there, and provisioning would have nothing to apply.
//
// vercel.json cannot fix that: outputFileTracingIncludes is a next.config.js
// option, and vercel.json rejects unknown keys outright.
//
// An import is traced. So the SQL becomes a module, and the bundler carries it
// the same way it carries any other dependency.
//
// GENERATED, NEVER EDITED. db/schema.sql stays the single source of truth for
// what a gym's database looks like; this is a build artefact of it.
import { readFileSync, writeFileSync } from 'node:fs';

// LINE ENDINGS NORMALISED. A Windows checkout gives db/schema.sql CRLF endings
// and Linux gives LF, so the same schema generated different modules - and
// different checksums, which the drift report compares per gym. CI on Linux
// failed on a module generated on Windows. The schema is now the same bytes
// wherever it is built.
const sql = readFileSync('db/schema.sql', 'utf8').replace(/\r\n/g, '\n');

const module = `// GENERATED from db/schema.sql by scripts/build-schema-module.mjs.
// Do not edit. Run \`npm run build:schema\` after changing db/schema.sql.
//
// This exists so Vercel bundles the schema with the platform function: an
// import is traced, a readFileSync is not.
export const GYM_SCHEMA_SQL = ${JSON.stringify(sql)};
`;

writeFileSync('db/schema.sql.js', module, 'utf8');
console.log(`db/schema.sql.js written (${sql.length} characters of SQL).`);
