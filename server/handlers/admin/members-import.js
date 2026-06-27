// POST /api/admin/members-import  { rows: [{ full_name, phone?, email?, id_number? }] }
// Bulk-import members (onboarding an existing gym). Each gets a membership number
// + verification code. Best-effort per row; returns created count + per-row errors.
// Owner/Manager.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError } from '../../lib/http.js';
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

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || {};
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
    return ok(res, { created, skipped: errors.length, errors: errors.slice(0, 50) });
  } catch (err) {
    console.error('members-import error:', err.message);
    return serverError(res, 'Import failed');
  }
}
