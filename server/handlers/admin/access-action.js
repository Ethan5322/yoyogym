// POST /api/admin/access-action  (Phase 99 §A2 + §C enforcement)
//   { id, action, note?, station_id? }
//   action = checkin | checkout | flag | approve_visit | deny_visit
// On check-in the compliance engine flags extra visits / violations, stores the
// flag on the check-in, and notifies the owner for approval. Owner/Manager/Reception.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError } from '../../lib/http.js';
import { requireRole } from '../../lib/auth.js';
import { loadCompliance, evaluateAccess } from '../../lib/compliance.js';
import { notifyOwner, notifyMemberEmail } from '../../lib/notify/index.js';
import { ownerTemplates } from '../../lib/notify/templates.js';
import { consumeSession } from '../../lib/sessions.js';

const startOfDay = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  const admin = requireRole(req, res, ['owner', 'manager', 'reception']);
  if (!admin) return;

  const { id, action, note, station_id = 'main' } = await readJsonBody(req);
  if (!id || !action) return badRequest(res, 'id and action are required.');

  const supabase = getSupabase();

  try {
    if (action === 'checkin') {
      const { data: open } = await supabase
        .from('checkins')
        .select('id')
        .eq('member_id', id)
        .is('checked_out_at', null)
        .gte('checked_in_at', startOfDay().toISOString())
        .maybeSingle();
      if (open) return ok(res, { message: 'Already checked in.', compliance: 'ok' });

      // compliance evaluation
      const [{ data: m }, { data: membership }, config] = await Promise.all([
        supabase.from('members').select('full_name, status, preferred_time').eq('id', id).maybeSingle(),
        supabase.from('memberships').select('tier').eq('member_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        loadCompliance(supabase),
      ]);
      const access = evaluateAccess({ member: m || { status: 'active' }, tier: membership?.tier, preferredTime: m?.preferred_time, openInsideMinutes: null, config });
      const compliance = access.is_violation ? 'violation' : access.is_extra ? 'extra' : 'ok';
      const approved = compliance === 'ok' ? true : null;

      const base = { member_id: id, method: 'face', verified_by: admin.sub };
      const extras = { ...base, station_id, compliance, approved };
      let { error } = await supabase.from('checkins').insert(extras);
      if (error) {
        // columns (station_id/compliance/approved) may not be migrated yet
        ({ error } = await supabase.from('checkins').insert(base));
      }
      if (error) return serverError(res, error.message);

      // notify owner for extra / violation
      if (compliance !== 'ok') {
        await notifyOwner(
          supabase,
          'extra_visit',
          ownerTemplates.extra_visit({ member: m?.full_name || 'A member', reason: access.reasons?.[0] || compliance }),
          id
        );
      }

      // Session-pack consumption + low reminder (spec 3.1 / 2.6 #7).
      const pack = await consumeSession(supabase, id);
      if (pack.consumed && (pack.low || pack.depleted)) {
        const { data: mem } = await supabase.from('members').select('full_name, email').eq('id', id).maybeSingle();
        if (mem?.email) {
          await notifyMemberEmail(supabase, { id, full_name: mem.full_name, email: mem.email }, 'session_low', { remaining: pack.remaining });
        }
      }

      return ok(res, {
        message: compliance === 'ok' ? 'Checked in — timer started. 💪' : `Checked in — flagged (${compliance}).`,
        compliance,
        sessions_remaining: pack.consumed ? pack.remaining : undefined,
        banner: access.banner,
        reasons: access.reasons,
      });
    }

    if (action === 'checkout') {
      const { data: open } = await supabase
        .from('checkins')
        .select('id, checked_in_at')
        .eq('member_id', id)
        .is('checked_out_at', null)
        .gte('checked_in_at', startOfDay().toISOString())
        .order('checked_in_at', { ascending: false })
        .maybeSingle();
      if (!open) return ok(res, { message: 'No open session to check out.' });
      const mins = Math.floor((Date.now() - new Date(open.checked_in_at)) / 60000);
      const { error } = await supabase.from('checkins').update({ checked_out_at: new Date().toISOString() }).eq('id', open.id);
      if (error) return serverError(res, error.message);
      return ok(res, { message: `Checked out — ${Math.floor(mins / 60)}h ${mins % 60}m logged.` });
    }

    if (action === 'approve_visit' || action === 'deny_visit') {
      const approved = action === 'approve_visit';
      const { data: last } = await supabase
        .from('checkins')
        .select('id')
        .eq('member_id', id)
        .gte('checked_in_at', startOfDay().toISOString())
        .order('checked_in_at', { ascending: false })
        .maybeSingle();
      if (!last) return badRequest(res, 'No check-in to review.');
      const { error } = await supabase.from('checkins').update({ approved }).eq('id', last.id);
      if (error) return serverError(res, error.message);
      return ok(res, { message: approved ? 'Extra visit approved.' : 'Extra visit denied.' });
    }

    if (action === 'flag') {
      const { data: m } = await supabase.from('members').select('staff_notes').eq('id', id).maybeSingle();
      const stamp = new Date().toLocaleString('en-ZA');
      const appended = `${m?.staff_notes ? m.staff_notes + '\n' : ''}[FLAG ${stamp}] ${note || 'Issue flagged at scan.'}`;
      const { error } = await supabase.from('members').update({ staff_notes: appended, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) return serverError(res, error.message);
      return ok(res, { message: 'Issue flagged on the member record.' });
    }

    return badRequest(res, 'Unknown action.');
  } catch (err) {
    console.error('access-action error:', err.message);
    return serverError(res, 'Action failed');
  }
}
