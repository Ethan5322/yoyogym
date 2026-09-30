// GET   /api/admin/member?id=...   -> full member profile (spec 4.4)
// PATCH /api/admin/member?id=...   -> update status / staff notes (quick actions)
// Owner/Manager.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError, failed } from '../../lib/http.js';
import { requireRole } from '../../lib/auth.js';
import { loadCompliance, expectedVisits, adherence } from '../../lib/compliance.js';
import { recordAudit } from '../../lib/audit.js';
import { eraseMember } from '../../lib/member-erasure.js';

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
      // One erasure for this button and for the day-30 job (CLAUDE.md §46.1
      // Q3; server/lib/member-erasure.js): payments stay without the person,
      // their messages and the message log go, and so does the platform's
      // "which gym did I join?" pointer. A member who asked is emailed.
      const result = await eraseMember(supabase, id, { confirm: 'if-asked' });
      if (!result.ok && !result.notFound) return failed(res, result.error);
      const indexCleared = result.notFound ? true : result.index_cleared;

      // Reported, not hidden: the owner is carrying out a legal request and
      // must know if part of it failed.
      await recordAudit(supabase, admin, {
        action: 'member.delete',
        entity: 'member',
        entity_id: id,
        detail: indexCleared ? null : `platform index not cleared: ${result.reason}`,
      });
      return ok(res, {
        deleted: true,
        index_cleared: indexCleared,
        ...(indexCleared ? {} : { warning: 'The member was deleted, but their gym lookup entry could not be removed. Please tell Yoyo Gyms support.' }),
      });
    }

    if (req.method === 'PATCH') {
      const body = await readJsonBody(req);
      const patch = { updated_at: new Date().toISOString() };
      if (body.status) patch.status = body.status;
      if (typeof body.staff_notes === 'string') patch.staff_notes = body.staff_notes;
      const { error } = await supabase.from('members').update(patch).eq('id', id);
      if (error) return failed(res, error);
      if (body.status) {
        await recordAudit(supabase, admin, { action: 'member.status', entity: 'member', entity_id: id, detail: `status → ${body.status}` });
      }
      return ok(res, { updated: true });
    }

    const { data: member, error } = await supabase.from('members').select('*').eq('id', id).maybeSingle();
    if (error) return failed(res, error);
    if (!member) return badRequest(res, 'Member not found.');

    const since30 = new Date(Date.now() - 30 * 86400000);
    const [{ data: memberships }, { data: payments }, { data: checkins }, { data: bookings }, { data: parq }, { data: addons }, { data: incidents }, { data: activity }, { count: visits30 }, config] =
      await Promise.all([
        supabase.from('memberships').select('*, plans(name)').eq('member_id', id).order('created_at', { ascending: false }),
        supabase.from('payments').select('*').eq('member_id', id).order('created_at', { ascending: false }).limit(50),
        supabase.from('checkins').select('checked_in_at, method').eq('member_id', id).order('checked_in_at', { ascending: false }).limit(30),
        supabase.from('class_bookings').select('session_date, status, classes(name)').eq('member_id', id).order('session_date', { ascending: false }).limit(30),
        supabase.from('parq_responses').select('*').eq('member_id', id).maybeSingle(),
        supabase.from('member_addons').select('*, addon_services(name)').eq('member_id', id),
        supabase.from('incidents').select('id, note, created_at, admin_users(full_name)').eq('member_id', id).order('created_at', { ascending: false }).limit(10),
        supabase.from('audit_log').select('action, detail, admin_name, created_at').eq('entity', 'member').eq('entity_id', String(id)).order('created_at', { ascending: false }).limit(15),
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
      incidents: (incidents || []).map((i) => ({ id: i.id, note: i.note, by: i.admin_users?.full_name || 'Staff', created_at: i.created_at })),
      activity: activity || [],
      adherence: { ...score, visits_30d: visits30 || 0, expected_30d: expected },
    });
  } catch (err) {
    console.error('member error:', err.message);
    return serverError(res, 'Could not load member');
  }
}
