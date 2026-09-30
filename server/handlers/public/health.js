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
import { allowMethods, ok, serverError, failed } from '../../lib/http.js';

// column -> the migration that adds it
const OPTIONAL_COLUMNS = {
  members: {
    face_templates: '2026-07-10-face-galleries.sql',
    arcface_templates: '2026-07-10-face-galleries.sql',
    nationality: '2026-07-11-international-members.sql',
    // Without it a member's "Request data deletion" fails outright — a
    // store requirement and a POPIA right.
    data_deletion_requested: '2026-09-24-member-deletion-request.sql',
    // Without it the day-30 erasure cannot tell when a member asked (§46.1 Q3).
    data_deletion_requested_at: '2026-09-30-member-deletion-date.sql',
    // Without it the gym cannot sign a member out everywhere ("lost phone").
    session_version: '2026-09-28-stay-signed-in.sql',
  },
  admin_users: {
    session_version: '2026-09-28-stay-signed-in.sql',
    face_templates: '2026-07-10-face-galleries.sql',
    arcface_templates: '2026-07-10-face-galleries.sql',
    arcface_embedding: '2026-07-10-face-galleries.sql',
  },
  trainers: {
    face_templates: '2026-07-10-face-galleries.sql',
    arcface_templates: '2026-07-10-face-galleries.sql',
    arcface_embedding: '2026-07-10-face-galleries.sql',
  },
  // The four member services (CLAUDE.md §41.1 Q3): without these tables the
  // services are switched on in the plans but cannot work.
  membership_pauses: { ends_on: '2026-09-29-member-services.sql' },
  rewards: { points: '2026-09-29-member-services.sql' },
  reward_claims: { status: '2026-09-29-member-services.sql' },
  challenges: { target_visits: '2026-09-29-member-services.sql' },
  challenge_entries: { show_on_board: '2026-09-29-member-services.sql' },
  member_groups: { payer_member_id: '2026-09-29-member-services.sql' },
  member_group_links: { member_id: '2026-09-29-member-services.sql' },
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
    //
    // `key`, not `id`: gym.settings is keyed by `key` and has no id column, so
    // counting `id` was refused by PostgREST and this endpoint answered
    // "DB error" for a perfectly healthy database.
    const { error } = await supabase.from('settings').select('key', { count: 'exact', head: true });
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
    return failed(res, err);
  }
}
