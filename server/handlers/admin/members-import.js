// POST /api/admin/members-import  { rows: [{ full_name, phone?, email?, id_number? }] }
// Bulk-import members (onboarding an existing gym). Each gets a membership number
// + verification code. Best-effort per row; returns created count + per-row errors.
// Owner/Manager.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError, json } from '../../lib/http.js';
import { currentGym } from '../../lib/tenancy.js';
import { allowsMemberRegistration } from '../../lib/entitlements.js';
import { requireRole } from '../../lib/auth.js';
import { generateMembershipNumber, generateVerificationCode } from '../../lib/identifiers.js';
import { recordAudit } from '../../lib/audit.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  const admin = requireRole(req, res, ['owner', 'manager']);
  if (!admin) return;

  try {
    const { rows } = await readJsonBody(req);
    if (!Array.isArray(rows) || !rows.length) return badRequest(res, 'No rows to import.');
    if (rows.length > 500) return badRequest(res, 'Please import at most 500 members at a time.');

    const supabase = getSupabase();
    let created = 0;
    const errors = [];

    // ---- plan member limit (platform only) ----
    // One of the TWO places a member is created (CLAUDE.md §18.4), and until
    // now the only one that did not check: a MEDIUM gym (150) could import
    // 500 at a time, as often as it liked. Same rule as registration — inert
    // in single-gym mode, and existing members are never touched. Rows past
    // the limit are REPORTED, not silently dropped, so the owner knows
    // exactly who was not imported.
    let room = Infinity;
    if (currentGym()) {
      const { count, error: countErr } = await supabase
        .from('members')
        .select('id', { count: 'exact', head: true })
        .neq('status', 'deleted');
      // A count that failed is not a count of zero — that would read as
      // "plenty of room".
      if (countErr) return serverError(res, 'Could not check your plan\'s member limit.');

      const limit = allowsMemberRegistration(count ?? 0);
      if (!limit.allowed) {
        return json(res, limit.status, { error: limit.message, limit: limit.limit });
      }
      room = limit.remaining ?? Infinity;
    }

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || {};
      if (created >= room) {
        errors.push({ row: i + 1, error: 'Not imported: your plan\'s member limit has been reached. Upgrade to add more.' });
        continue;
      }
      const full_name = (r.full_name || '').trim();
      if (!full_name) { errors.push({ row: i + 1, error: 'Missing full name' }); continue; }
      try {
        const membership_number = await generateMembershipNumber(supabase);
        const verification_code = await generateVerificationCode(supabase);
        const { error } = await supabase.from('members').insert({
          full_name,
          phone: (r.phone || '').trim() || null,
          email: (r.email || '').trim() || null,
          id_number: (r.id_number || '').trim() || null,
          membership_number,
          verification_code,
          status: 'active',
        });
        if (error) { errors.push({ row: i + 1, error: error.message }); continue; }
        created++;
      } catch (e) {
        errors.push({ row: i + 1, error: e.message });
      }
    }

    await recordAudit(supabase, admin, { action: 'member.import', entity: 'member', detail: `${created} imported, ${errors.length} skipped` });
    return ok(res, {
      created,
      skipped: errors.length,
      // Told plainly, so the screen can offer the upgrade rather than leave
      // the owner reading fifty identical row errors.
      limitReached: room !== Infinity && created >= room && rows.length > created,
      errors: errors.slice(0, 50),
    });
  } catch (err) {
    console.error('members-import error:', err.message);
    return serverError(res, 'Import failed');
  }
}
