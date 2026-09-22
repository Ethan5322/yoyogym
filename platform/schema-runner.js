// Creating a gym's schema — the DDL half of provisioning.
//
// PostgREST cannot create a schema, so this goes through the Supabase
// Management API's query endpoint: POST /v1/projects/{ref}/database/query
// (verified against the Management API reference, not assumed).
//
// ⚠️ THE TOKEN THIS USES CAN ALTER EVERY GYM'S DATABASE. It is a platform-level
// secret. It never goes near `gym_secrets`, never reaches a browser, and is not
// needed by anything except provisioning and migrations.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const BASE = process.env.SUPABASE_MANAGEMENT_URL || 'https://api.supabase.com';

/** A schema name is interpolated into DDL, so it must be a plain identifier. */
const SAFE_SCHEMA = /^[a-z_][a-z0-9_]{0,50}$/;

function assertSafe(schema) {
  if (!SAFE_SCHEMA.test(schema || '')) {
    // Refused, never escaped-and-continued: an unsafe name here means something
    // upstream is wrong, and quietly rewriting it would hide that.
    throw new Error(`Unsafe schema name: ${schema}`);
  }
  return schema;
}

/** Run SQL against the shared project. */
export async function runSql(query, { projectRef = process.env.SUPABASE_PROJECT_REF } = {}) {
  const token = process.env.SUPABASE_MANAGEMENT_TOKEN;
  if (!token) throw new Error('Missing SUPABASE_MANAGEMENT_TOKEN.');
  if (!projectRef) throw new Error('Missing SUPABASE_PROJECT_REF.');

  const res = await fetch(`${BASE}/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    // The response body can echo SQL and identifiers; keep it out of logs.
    throw new Error(`Supabase query failed: ${res.status}`);
  }
  return res.json().catch(() => null);
}

/** The gym schema, as shipped. One definition for every gym. */
export function gymSchemaSql() {
  const path = fileURLToPath(new URL('../db/schema.sql', import.meta.url));
  return readFileSync(path, 'utf8');
}

/** So a gym's recorded baseline can be compared against what is in git. */
export function gymSchemaChecksum() {
  return createHash('sha256').update(gymSchemaSql()).digest('hex');
}

/**
 * Rewrite the shipped gym schema for one gym's schema name.
 *
 * `db/schema.sql` is written for a schema called `gym`. Every reference is
 * replaced with this gym's own schema, and the search_path is set so anything
 * unqualified lands in the right place too.
 */
export function gymSchemaSqlFor(schema) {
  assertSafe(schema);
  return gymSchemaSql()
    .replace(/create schema if not exists gym;/g, `create schema if not exists ${schema};`)
    .replace(/\bgym\./g, `${schema}.`)
    .replace(/set search_path = gym, public;/g, `set search_path = ${schema}, public;`);
}

/** Provisioning's DDL dependencies, against a real Supabase project. */
export function schemaRunnerDeps({ projectRef } = {}) {
  const opts = { projectRef };

  return {
    createSchema: async (schema) => {
      assertSafe(schema);
      await runSql(`create schema if not exists ${schema};`, opts);
    },

    applySchema: async (schema) => {
      await runSql(gymSchemaSqlFor(schema), opts);
    },

    seed: async (schema, application) => {
      // Only the gym's own profile. The owner's admin account is created by the
      // existing seed script at handover, so a password is never generated here
      // and emailed around.
      assertSafe(schema);
      const profile = JSON.stringify({
        gym_name: application.proposed_gym_name,
        city: application.city,
        country: application.country,
      }).replace(/'/g, "''");

      await runSql(
        `insert into ${schema}.settings (key, value, category)
         values ('gym_profile', '${profile}'::jsonb, 'branding')
         on conflict (key) do nothing;`,
        opts
      );
    },

    /**
     * Expose the schema to the API.
     *
     * ⚠️ The reload affects EVERY gym on the project (D-097), which is why
     * provisioning does this last. The existing list is read and extended
     * rather than replaced, so one provision cannot un-expose every other gym.
     */
    exposeSchema: async (schema) => {
      assertSafe(schema);
      await runSql(
        `do $$
         declare current_schemas text;
         begin
           select coalesce(
             (select setting from pg_settings where name = 'pgrst.db_schemas'),
             'public, graphql_public'
           ) into current_schemas;

           if position('${schema}' in current_schemas) = 0 then
             execute format('alter role authenticator set pgrst.db_schemas = %L', current_schemas || ', ${schema}');
             notify pgrst, 'reload config';
           end if;
         end $$;`,
        opts
      );
    },
  };
}
