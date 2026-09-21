// Supabase Management API client — creates and lists the per-gym projects.
//
// This is the only file that can spend money. Creating a project starts a
// monthly charge, so every call here is deliberate and none of them run unless
// a caller explicitly asks for a live run (see platform/provisioning.js, where
// dry run is the default).
//
// Endpoints per the Supabase Management API reference:
//   POST /v1/projects                          create
//   GET  /v1/organizations/{org_id}/projects   list
//   DELETE /v1/projects/{ref}                  delete  (never called automatically)
//
// Auth: a Management API token with project create/read scope, supplied as
// SUPABASE_MANAGEMENT_TOKEN. It is a PLATFORM-level secret: it can create and
// delete every gym's database, so it never goes near gym_secrets and never
// reaches a browser.
const BASE = process.env.SUPABASE_MANAGEMENT_URL || 'https://api.supabase.com';

function token() {
  const t = process.env.SUPABASE_MANAGEMENT_TOKEN;
  if (!t) {
    throw new Error(
      'Missing SUPABASE_MANAGEMENT_TOKEN. Provisioning needs a Supabase Management API token.'
    );
  }
  return t;
}

async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  if (!res.ok) {
    // Never echo the response body wholesale — a management API error can
    // contain project identifiers and other detail that should not land in a
    // log aggregator.
    throw new Error(`Supabase Management API ${method} ${path} failed: ${res.status}`);
  }
  return text ? JSON.parse(text) : null;
}

/** Strong random database password. The platform never needs to remember it. */
function generateDbPassword() {
  const bytes = new Uint8Array(32);
  (globalThis.crypto ?? require('node:crypto').webcrypto).getRandomValues(bytes);
  return Buffer.from(bytes).toString('base64url');
}

/**
 * Create a Supabase project for one gym.
 *
 * ⚠️ This starts a monthly charge the moment it succeeds.
 *
 * Returns the shape provisioning.js expects. Note the service key is NOT
 * returned by the create call — it is fetched separately once the project is
 * ready, because a project is provisioned asynchronously on Supabase's side.
 */
export async function createSupabaseProject({ name, region, organizationSlug, plan }) {
  const project = await call('/v1/projects', {
    method: 'POST',
    body: {
      name,
      organization_slug: organizationSlug || process.env.SUPABASE_ORG_SLUG,
      db_pass: generateDbPassword(),
      region: region || process.env.SUPABASE_DEFAULT_REGION || 'eu-west-1',
      ...(plan ? { plan } : {}),
    },
  });

  return {
    project_ref: project.id ?? project.ref,
    url: `https://${project.id ?? project.ref}.supabase.co`,
    // Filled in by fetchProjectKeys once the project finishes provisioning.
    service_key: null,
    jwt_secret: null,
    raw: project,
  };
}

/** The API keys for a project, once it has finished provisioning. */
export async function fetchProjectKeys(projectRef) {
  const keys = await call(`/v1/projects/${projectRef}/api-keys`);
  const service = (keys || []).find((k) => k.name === 'service_role');
  if (!service) throw new Error(`No service_role key available yet for ${projectRef}`);
  return { service_key: service.api_key };
}

/** Every project in the organisation. Used by reconciliation. */
export async function listProjects(orgId) {
  const org = orgId || process.env.SUPABASE_ORG_ID;
  if (!org) throw new Error('Missing SUPABASE_ORG_ID for listing projects.');
  const projects = await call(`/v1/organizations/${org}/projects`);
  return (projects || []).map((p) => ({
    project_ref: p.id ?? p.ref,
    name: p.name,
    created_at: p.created_at,
    status: p.status,
  }));
}

/**
 * Delete a project.
 *
 * ⚠️ DESTRUCTIVE AND IRREVERSIBLE — this is a gym's entire database.
 *
 * Deliberately NOT called by provisioning or reconciliation. It exists so a
 * human decision can be carried out, and the caller must pass
 * `{ iUnderstandThisIsPermanent: true }` so it cannot be invoked by reflex.
 */
export async function deleteProject(projectRef, { iUnderstandThisIsPermanent } = {}) {
  if (iUnderstandThisIsPermanent !== true) {
    throw new Error(
      'deleteProject refused: deleting a gym database is permanent and must be explicit.'
    );
  }
  return call(`/v1/projects/${projectRef}`, { method: 'DELETE' });
}
