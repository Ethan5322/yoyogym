// POST /api/admin/verify  { code }  -> access decision (spec 4.3).
// `code` may be a verification code OR a membership number. On a valid active
// member it logs a check-in automatically. Owner/Manager/Reception.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError } from '../../lib/http.js';
import { requireRole } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  const admin = requireRole(req, res, ['owner', 'manager', 'reception']);
  if (!admin) return;

  try {
    const { code } = await readJsonBody(req);
    if (!code) return badRequest(res, 'A verification code or membership number is required.');
    const value = code.trim().toUpperCase();

    const supabase = getSupabase();
    const { data: member, error } = await supabase
      .from('members')
      .select('id, full_name, membership_number, status, parq_flag, photo_url')
      .or(`verification_code.eq.${value},membership_number.eq.${value}`)
      .maybeSingle();
    if (error) return serverError(res, error.message);

    // Not found / blocked: show minimal info (no sensitive details).
    if (!member) return ok(res, { granted: false, reason: 'not_found' });
    if (member.status === 'suspended') return ok(res, { granted: false, reason: 'suspended' });
    if (member.status === 'lapsed' || member.status === 'expiring') {
      // expiring still allowed; lapsed denied
      if (member.status === 'lapsed') return ok(res, { granted: false, reason: 'expired' });
    }
    if (member.status === 'new') return ok(res, { granted: false, reason: 'payment_pending' });

    // Active (or expiring) -> granted. Gather context.
    const { data: membership } = await supabase
      .from('memberships')
      .select('tier, end_date, sessions_remaining, plans(name)')
      .eq('member_id', member.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: pending } = await supabase
      .from('payments')
      .select('amount')
      .eq('member_id', member.id)
      .in('status', ['pending', 'failed']);
    const outstanding = (pending || []).reduce((s, p) => s + Number(p.amount || 0), 0);

    // Log the check-in.
    await supabase.from('checkins').insert({
      member_id: member.id,
      method: 'verification',
      verified_by: admin.sub,
    });

    return ok(res, {
      granted: true,
      member: {
        full_name: member.full_name,
        membership_number: member.membership_number,
        status: member.status,
        photo_url: member.photo_url,
        tier: membership?.tier || null,
        plan_name: membership?.plans?.name || null,
        valid_until: membership?.end_date || null,
        sessions_remaining: membership?.sessions_remaining ?? null,
        parq_flag: member.parq_flag,
        outstanding_balance: outstanding,
        payment_ok: outstanding === 0,
      },
    });
  } catch (err) {
    console.error('verify error:', err.message);
    return serverError(res, 'Verification failed');
  }
}
