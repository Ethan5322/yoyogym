// Rewards, as the owner runs them (CLAUDE.md §41.1 Q3).
//   GET                                  rewards, the claims (waiting first), the rules
//   POST  { name, description, points }  add a reward            — owner, manager
//   PATCH { id, name?, description?, points?, is_enabled? }       — owner, manager
//   POST  { action: 'claim', id, status: 'given' | 'cancelled' } — staff at the desk
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError, failed } from '../../lib/http.js';
import { requireRole } from '../../lib/auth.js';
import { recordAudit } from '../../lib/audit.js';
import { REWARD_RULES_KEY, cleanRewardRules } from '../../lib/loyalty.js';

const MANAGE = ['owner', 'manager'];
const DESK = ['owner', 'manager', 'reception'];

const text = (v, max) => String(v ?? '').trim().slice(0, max);

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST', 'PATCH'])) return;
  const admin = requireRole(req, res, DESK);
  if (!admin) return;
  const may = (roles) => roles.includes(admin.role);
  const supabase = getSupabase();

  try {
    if (req.method === 'GET') {
      const [{ data: rewards, error }, { data: claims }, { data: rules }] = await Promise.all([
        supabase.from('rewards').select('*').order('points', { ascending: true }),
        supabase
          .from('reward_claims')
          .select('id, reward_name, points, status, created_at, decided_at, member_id, members(full_name, membership_number)')
          .order('created_at', { ascending: false })
          .limit(100),
        supabase.from('settings').select('value').eq('key', REWARD_RULES_KEY).maybeSingle(),
      ]);
      if (error) return failed(res, error);
      const rows = (claims || []).map(({ members, ...c }) => ({
        ...c,
        member_name: members?.full_name || '',
        membership_number: members?.membership_number || '',
      }));
      // Waiting claims first: they are someone standing at the desk.
      rows.sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1));
      return ok(res, { rewards: rewards || [], claims: rows, rules: cleanRewardRules(rules?.value) });
    }

    const body = await readJsonBody(req);

    if (req.method === 'POST' && body.action === 'claim') {
      if (!['given', 'cancelled'].includes(body.status)) return badRequest(res, 'Unknown status.');
      const { data, error } = await supabase
        .from('reward_claims')
        .update({ status: body.status, decided_at: new Date().toISOString(), decided_by: admin.sub })
        .eq('id', body.id)
        .eq('status', 'pending')
        .select('id, member_id')
        .maybeSingle();
      if (error) return failed(res, error);
      if (!data) return badRequest(res, 'That claim has already been dealt with.');
      await recordAudit(supabase, admin, { action: `reward.claim_${body.status}`, entity: 'member', entity_id: data.member_id });
      return ok(res, { saved: true });
    }

    if (!may(MANAGE)) return badRequest(res, 'Only the owner or a manager can change the rewards.');

    if (req.method === 'POST') {
      const name = text(body.name, 80);
      const points = Number.parseInt(body.points, 10);
      if (!name) return badRequest(res, 'Give the reward a name.');
      if (!Number.isInteger(points) || points < 1) return badRequest(res, 'Points must be a whole number above zero.');
      const { data, error } = await supabase
        .from('rewards')
        .insert({ name, description: text(body.description, 300) || null, points })
        .select('id')
        .single();
      if (error) return failed(res, error);
      await recordAudit(supabase, admin, { action: 'reward.created', entity: 'reward', entity_id: data.id });
      return ok(res, { id: data.id });
    }

    // PATCH
    const patch = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) patch.name = text(body.name, 80);
    if (body.description !== undefined) patch.description = text(body.description, 300) || null;
    if (body.points !== undefined) {
      const points = Number.parseInt(body.points, 10);
      if (!Number.isInteger(points) || points < 1) return badRequest(res, 'Points must be a whole number above zero.');
      patch.points = points;
    }
    if (body.is_enabled !== undefined) patch.is_enabled = Boolean(body.is_enabled);
    if (patch.name === '') return badRequest(res, 'Give the reward a name.');
    const { error } = await supabase.from('rewards').update(patch).eq('id', body.id);
    if (error) return failed(res, error);
    await recordAudit(supabase, admin, { action: 'reward.updated', entity: 'reward', entity_id: body.id });
    return ok(res, { saved: true });
  } catch (err) {
    console.error('rewards error:', err.message);
    return serverError(res, 'Could not update the rewards.');
  }
}
