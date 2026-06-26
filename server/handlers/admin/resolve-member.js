// GET /api/admin/resolve-member?q=...   (or ?membership_number=... legacy)
// Resolves a scanned/typed value to a person. Matches, in order:
//   member  by membership_number OR verification_code
//   trainer by trainer_number   OR verification_code
// Returns { found, id, type } so the scan can open the right access card.
// Owner/Manager/Reception.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, ok, badRequest, serverError } from '../../lib/http.js';
import { requireRole } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;
  if (!requireRole(req, res, ['owner', 'manager', 'reception'])) return;

  const url = new URL(req.url, 'http://localhost');
  const raw = url.searchParams.get('q') || url.searchParams.get('membership_number');
  if (!raw) return badRequest(res, 'A code or membership number is required.');
  const v = raw.trim().toUpperCase();

  try {
    const supabase = getSupabase();

    // 1) Member by membership number or verification code.
    const { data: member, error } = await supabase
      .from('members')
      .select('id')
      .or(`membership_number.eq.${v},verification_code.eq.${v}`)
      .maybeSingle();
    if (error) return serverError(res, error.message);
    if (member) return ok(res, { found: true, id: member.id, type: 'member' });

    // 2) Trainer by trainer number or verification code (best-effort — columns
    //    may not exist on older tenants).
    try {
      const { data: trainer } = await supabase
        .from('trainers')
        .select('id')
        .or(`trainer_number.eq.${v},verification_code.eq.${v}`)
        .maybeSingle();
      if (trainer) return ok(res, { found: true, id: trainer.id, type: 'trainer' });
    } catch {
      /* trainer credential columns not migrated — ignore */
    }

    return ok(res, { found: false });
  } catch (err) {
    console.error('resolve-member error:', err.message);
    return serverError(res, 'Lookup failed');
  }
}
