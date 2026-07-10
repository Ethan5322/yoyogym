// Database access for face template galleries.
//
// The gallery columns (`arcface_templates`, `face_templates`) arrive with the
// 2026-07-10 migration, and `arcface_embedding` reaches admin_users / trainers
// with it too. A gym that has not run the migration must keep working on the
// legacy single-template columns rather than have face login start returning
// 500s, so every read and write here degrades gracefully when the columns are
// missing.
//
// Writes retry in TIERS, dropping the least amount that could be missing first:
// only the new gallery columns, then also `arcface_embedding`. A tenant that
// already has `arcface_embedding` (from the earlier ArcFace migration) therefore
// keeps storing it even before running the gallery migration. Dropping a column
// loses nothing — the retry only runs after the database rejected the write for
// referencing a column that does not exist.
const WRITE_FALLBACK_TIERS = [
  ['arcface_templates', 'face_templates'],
  ['arcface_templates', 'face_templates', 'arcface_embedding'],
];

/**
 * Select rows including the gallery columns, retrying with `legacyColumns`
 * alone if this tenant has not been migrated.
 *
 * @param apply  builder => builder, for adding filters to the query
 */
export async function selectFaceRows(supabase, table, { columns, legacyColumns, apply = (q) => q }) {
  const first = await apply(supabase.from(table).select(columns));
  if (!first.error) return { data: first.data, error: null, degraded: false };

  const retry = await apply(supabase.from(table).select(legacyColumns));
  if (retry.error) return { data: null, error: retry.error, degraded: false };
  return { data: retry.data, error: null, degraded: true };
}

function withoutColumns(row, columns) {
  const out = { ...row };
  let removed = 0;
  for (const c of columns) {
    if (c in out) {
      delete out[c];
      removed++;
    }
  }
  return removed ? out : null;
}

/**
 * Insert a row, retrying without the optional columns (in tiers) if this tenant
 * lacks them. Returns the same shape as `.insert().select(sel).single()`.
 */
export async function insertFaceRow(supabase, table, row, sel = 'id') {
  let last = await supabase.from(table).insert(row).select(sel).single();
  if (!last.error) return last;

  for (const tier of WRITE_FALLBACK_TIERS) {
    const fallback = withoutColumns(row, tier);
    if (!fallback) continue;
    last = await supabase.from(table).insert(fallback).select(sel).single();
    if (!last.error) return last;
  }
  return last;
}

/**
 * Update a row, retrying without the optional columns (in tiers) if this tenant
 * lacks them. `degraded` is true when the write only succeeded after the gallery
 * columns were dropped — the caller should then skip adaptive learning.
 */
export async function updateFaceRow(supabase, table, id, patch) {
  const first = await supabase.from(table).update(patch).eq('id', id);
  if (!first.error) return { error: null, degraded: false };

  let last = first;
  for (const tier of WRITE_FALLBACK_TIERS) {
    const fallback = withoutColumns(patch, tier);
    if (!fallback) continue;
    last = await supabase.from(table).update(fallback).eq('id', id);
    if (!last.error) return { error: null, degraded: true };
  }
  return { error: last.error, degraded: false };
}
