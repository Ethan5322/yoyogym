// Families and groups, as staff manage them (CLAUDE.md §41.1 Q3). Owner, manager.
//   GET                       every family and group, with their members
//   GET ?member_id=…          the one a member belongs to, or none
//   POST { action: 'create', name, kind, member_id }       new group; that member pays
//   POST { action: 'add', group_id, membership_number }
//   POST { action: 'remove', group_id, member_id }         the last one out closes it
//   POST { action: 'payer', group_id, member_id }
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError, failed } from '../../lib/http.js';
import { requireRole } from '../../lib/auth.js';
import { recordAudit } from '../../lib/audit.js';
import { GROUP_PRICING_KEY, GROUP_KINDS, cleanGroupPricing, addProblem } from '../../lib/groups.js';

async function groupWithMembers(supabase, groupId) {
  const [{ data: group }, { data: links }] = await Promise.all([
    supabase.from('member_groups').select('*').eq('id', groupId).maybeSingle(),
    supabase.from('member_group_links').select('member_id, added_at, members(full_name, membership_number, status)').eq('group_id', groupId),
  ]);
  if (!group) return null;
  return {
    ...group,
    members: (links || []).map(({ members, ...l }) => ({
      ...l,
      full_name: members?.full_name || '',
      membership_number: members?.membership_number || '',
      status: members?.status || '',
      is_payer: l.member_id === group.payer_member_id,
    })),
  };
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;
  const admin = requireRole(req, res, ['owner', 'manager']);
  if (!admin) return;
  const supabase = getSupabase();

  try {
    const { data: pricingRow } = await supabase.from('settings').select('value').eq('key', GROUP_PRICING_KEY).maybeSingle();
    const pricing = cleanGroupPricing(pricingRow?.value);

    if (req.method === 'GET') {
      const memberId = new URL(req.url, 'http://localhost').searchParams.get('member_id');
      if (memberId) {
        const { data: link } = await supabase.from('member_group_links').select('group_id').eq('member_id', memberId).maybeSingle();
        return ok(res, { group: link ? await groupWithMembers(supabase, link.group_id) : null, pricing });
      }
      const { data: groups, error } = await supabase.from('member_groups').select('id').order('created_at', { ascending: false }).limit(200);
      if (error) return failed(res, error);
      const all = [];
      for (const g of groups || []) all.push(await groupWithMembers(supabase, g.id));
      return ok(res, { groups: all.filter(Boolean), pricing });
    }

    const body = await readJsonBody(req);

    if (body.action === 'create') {
      const name = String(body.name || '').trim().slice(0, 80);
      if (!name) return badRequest(res, 'Give the family or group a name.');
      if (!GROUP_KINDS.includes(body.kind)) return badRequest(res, 'Choose family or group.');
      const { data: member } = await supabase.from('members').select('id').eq('id', body.member_id).maybeSingle();
      if (!member) return badRequest(res, 'Member not found.');
      const { data: already } = await supabase.from('member_group_links').select('group_id').eq('member_id', member.id).maybeSingle();
      if (already) return badRequest(res, 'This member already belongs to a family or group.');
      const { data: group, error } = await supabase
        .from('member_groups')
        .insert({ name, kind: body.kind, payer_member_id: member.id })
        .select('id')
        .single();
      if (error) return failed(res, error);
      await supabase.from('member_group_links').insert({ group_id: group.id, member_id: member.id });
      await recordAudit(supabase, admin, { action: 'group.created', entity: 'member_group', entity_id: group.id });
      return ok(res, { group: await groupWithMembers(supabase, group.id) });
    }

    const group = await groupWithMembers(supabase, body.group_id);
    if (!group) return badRequest(res, 'That family or group does not exist.');

    if (body.action === 'add') {
      const number = String(body.membership_number || '').trim().toUpperCase();
      const { data: member } = await supabase.from('members').select('id').eq('membership_number', number).maybeSingle();
      let elsewhere = false;
      if (member) {
        const { data: link } = await supabase.from('member_group_links').select('group_id').eq('member_id', member.id).maybeSingle();
        elsewhere = Boolean(link && link.group_id !== group.id);
      }
      const problem = addProblem({ group, links: group.members, member, pricing, memberLinkedElsewhere: elsewhere });
      if (problem) return badRequest(res, problem);
      const { error } = await supabase.from('member_group_links').insert({ group_id: group.id, member_id: member.id });
      if (error) return failed(res, error);
      await recordAudit(supabase, admin, { action: 'group.member_added', entity: 'member_group', entity_id: group.id, detail: { member_id: member.id } });
      return ok(res, { group: await groupWithMembers(supabase, group.id) });
    }

    if (body.action === 'remove') {
      await supabase.from('member_group_links').delete().eq('group_id', group.id).eq('member_id', body.member_id);
      const left = group.members.filter((m) => m.member_id !== body.member_id);
      if (!left.length) {
        await supabase.from('member_groups').delete().eq('id', group.id);
      } else if (group.payer_member_id === body.member_id) {
        // The payer left: the longest-standing member pays until staff choose.
        await supabase.from('member_groups').update({ payer_member_id: left[0].member_id }).eq('id', group.id);
      }
      await recordAudit(supabase, admin, { action: 'group.member_removed', entity: 'member_group', entity_id: group.id, detail: { member_id: body.member_id } });
      return ok(res, { group: left.length ? await groupWithMembers(supabase, group.id) : null });
    }

    if (body.action === 'payer') {
      if (!group.members.some((m) => m.member_id === body.member_id)) return badRequest(res, 'The payer must be in the family or group.');
      await supabase.from('member_groups').update({ payer_member_id: body.member_id, updated_at: new Date().toISOString() }).eq('id', group.id);
      await recordAudit(supabase, admin, { action: 'group.payer_changed', entity: 'member_group', entity_id: group.id });
      return ok(res, { group: await groupWithMembers(supabase, group.id) });
    }

    return badRequest(res, 'Unknown action.');
  } catch (err) {
    console.error('member-groups error:', err.message);
    return serverError(res, 'Could not update the family or group.');
  }
}
