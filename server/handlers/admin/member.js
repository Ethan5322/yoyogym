// GET   /api/admin/member?id=...   -> full member profile (spec 4.4)
// PATCH /api/admin/member?id=...   -> update status / staff notes (quick actions)
// Owner/Manager.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError } from '../../lib/http.js';
import { requireRole } from '../../lib/auth.js';
import { loadCompliance, expectedVisits, adherence } from '../../lib/compliance.js';
import { recordAudit } from '../../lib/audit.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'PATCH', 'DELETE'])) return;
  // Deletion is irreversible (POPIA right to erasure) -> owner only.
  const roles = req.method === 'DELETE' ? ['owner'] : ['owner', 'manager'];
  const admin = requireRole(req, res, roles);
  if (!admin) return;

  const url = new URL(req.url, 'http://localhost');
  const id = url.searchParams.get('id');
  if (!id) return badRequest(res, 'id is required.');

  const supabase = getSupabase();

  try {
    if (req.method === 'DELETE') {
      // POPIA erasure: cascading FKs remove memberships, parq, checkins, etc.
      const { error } = await supabase.from('members').delete().eq('id', id);
      if (error) return serverError(res, error.message);
      await recordAudit(supabase, admin, { action: 'member.delete', entity: 'member', entity_id: id });
      return ok(res, { deleted: true });
    }

    if (req.method === 'PATCH') {
      const body = await readJsonBody(req);
      const patch = { updated_at: new Date().toISOString() };
      if (body.status) patch.status = body.status;
      if (typeof body.staff_notes === 'string') patch.staff_notes = body.staff_notes;
      const { error } = await supabase.from('members').update(patch).eq('id', id);
      if (error) return serverError(res, error.message);
      if (body.status) {
        await recordAudit(supabase, admin, { action: 'member.status', entity: 'member', entity_id: id, detail: `status → ${body.status}` });
      }
      return ok(res, { updated: true });
    }

    const { data: member, error } = await supabase.from('members').select('*').eq('id', id).maybeSingle();
    if (error) return serverError(res, error.message);
    if (!member) return badRequest(res, 'Member not found.');

    const since30 = new Date(Date.now() - 30 * 86400000);
    const [{ data: memberships }, { data: payments }, { data: checkins }, { data: bookings }, { data: parq }, { data: addons }, { count: visits30 }, config] =
      await Promise.all([
        supabase.from('memberships').select('*, plans(name)').eq('member_id', id).order('created_at', { ascending: false }),
        supabase.from('payments').select('*').eq('member_id', id).order('created_at', { ascending: false }).limit(50),
        supabase.from('checkins').select('checked_in_at, method').eq('member_id', id).order('checked_in_at', { ascending: false }).limit(30),
        supabase.from('class_bookings').select('session_date, status, classes(name)').eq('member_id', id).order('session_date', { ascending: false }).limit(30),
        supabase.from('parq_responses').select('*').eq('member_id', id).maybeSingle(),
        supabase.from('member_addons').select('*, addon_services(name)').eq('member_id', id),
        supabase.from('checkins').select('id', { count: 'exact', head: true }).eq('member_id', id).gte('checked_in_at', since30.toISOString()),
        loadCompliance(supabase),
      ]);

    const expected = expectedVisits(config, member.training_frequency, 30);
    const score = adherence(config, visits30 || 0, expected);

    return ok(res, {
      member,
      memberships: memberships || [],
      payments: payments || [],
      checkins: checkins || [],
      bookings: bookings || [],
      parq: parq || null,
      addons: addons || [],
      adherence: { ...score, visits_30d: visits30 || 0, expected_30d: expected },
    });
  } catch (err) {
    console.error('member error:', err.message);
    return serverError(res, 'Could not load member');
  }
}
