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
           -- READ FROM pg_roles.rolconfig, NOT pg_settings.
           --
           -- The exposed-schema list is stored ON THE authenticator ROLE.
           -- pg_settings shows the CURRENT session's value, and this runs as
           -- postgres through the Management API — so pg_settings finds
           -- nothing, the coalesce falls back to a bare default, and the next
           -- statement overwrites the role with that plus the new gym.
           --
           -- That would DROP every existing gym AND the platform schema from
           -- the list. The first gym ever provisioned would take the whole
           -- platform down with it, and the only symptom would be PGRST106
           -- on absolutely everything.
           select coalesce(
             (select replace(cfg, 'pgrst.db_schemas=', '')
                from pg_roles r, unnest(r.rolconfig) cfg
               where r.rolname = 'authenticator'
                 and cfg like 'pgrst.db_schemas=%'
               limit 1),
             'public, graphql_public'
           ) into current_schemas;

           if position('${schema}' in current_schemas) = 0 then
             execute format('alter role authenticator set pgrst.db_schemas = %L', current_schemas || ', ${schema}');
             -- 'reload config' for WHICH schemas, then 'reload schema' for
             -- what is inside them. Only one, or the wrong order, leaves the
             -- gym exposed with none of its tables in the cache — which reads
             -- as "table not found" and sends somebody hunting.
             notify pgrst, 'reload config';
             notify pgrst, 'reload schema';
           end if;
         end $$;`,
        opts
      );
    },
  };
}
