// GET /api/health -> verifies the function runtime and Supabase connectivity.
// Useful to confirm env vars + the "gym" schema are wired correctly after deploy.
//
// It also reports MISSING OPTIONAL COLUMNS. The face code degrades gracefully
// when a tenant has not run a migration — writes retry without the new columns
// so nothing 500s — but that graceful degradation is invisible from the outside.
// A gym whose gallery columns are missing keeps enrolling members with a single
// frozen face template, and the only symptom is "recognition keeps failing".
// Surfacing it here turns a silent misconfiguration into a one-line check.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, ok, serverError } from '../../lib/http.js';

// column -> the migration that adds it
const OPTIONAL_COLUMNS = {
  members: {
    face_templates: '2026-07-10-face-galleries.sql',
    arcface_templates: '2026-07-10-face-galleries.sql',
    nationality: '2026-07-11-international-members.sql',
  },
  admin_users: {
    face_templates: '2026-07-10-face-galleries.sql',
    arcface_templates: '2026-07-10-face-galleries.sql',
    arcface_embedding: '2026-07-10-face-galleries.sql',
  },
  trainers: {
    face_templates: '2026-07-10-face-galleries.sql',
    arcface_templates: '2026-07-10-face-galleries.sql',
    arcface_embedding: '2026-07-10-face-galleries.sql',
  },
};

async function missingColumns(supabase) {
  const missing = [];
  await Promise.all(
    Object.entries(OPTIONAL_COLUMNS).flatMap(([table, columns]) =>
      Object.entries(columns).map(async ([column, migration]) => {
        const { error } = await supabase.from(table).select(column).limit(1);
        if (error) missing.push({ table, column, migration });
      })
    )
  );
  return missing;
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;
  try {
    const supabase = getSupabase();
    // Cheap query against the gym schema to prove the connection + schema work.
    const { error } = await supabase.from('settings').select('id', { count: 'exact', head: true });
    if (error) return serverError(res, `DB error: ${error.message}`);

    const missing = await missingColumns(supabase);
    const migrations = [...new Set(missing.map((m) => m.migration))].sort();

    return ok(res, {
      status: 'ok',
      schema: process.env.SUPABASE_SCHEMA || 'gym',
      time: new Date().toISOString(),
      face_service: process.env.FACE_SERVICE_URL ? 'configured' : 'not configured (face-api fallback)',
      // Empty arrays mean "fully migrated" — the healthy state.
      pending_migrations: migrations,
      missing_columns: missing,
      ...(migrations.length
        ? { warning: `Run these in the Supabase SQL editor (db/migrations/): ${migrations.join(', ')}` }
        : {}),
    });
  } catch (err) {
    return serverError(res, err.message);
  }
}
