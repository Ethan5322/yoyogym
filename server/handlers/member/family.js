// Family and group membership, as the member sees it (CLAUDE.md §41.1 Q3).
//   GET   the family or group they belong to: first names, who pays, the discount
//
// Staff set groups up; a member only reads theirs. Other members appear by
// first name only — enough to recognise your own family, nothing more.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, ok, serverError, failed } from '../../lib/http.js';
import { authenticateMember } from '../../lib/memberauth.js';
import { GROUP_PRICING_KEY, cleanGroupPricing, discountFor } from '../../lib/groups.js';

const firstName = (full) => String(full || '').trim().split(/\s+/)[0] || 'Member';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;
  const auth = authenticateMember(req, res);
  if (!auth) return;
  const supabase = getSupabase();

  try {
    const { data: link, error } = await supabase.from('member_group_links').select('group_id').eq('member_id', auth.sub).maybeSingle();
    if (error) return failed(res, error);
    const { data: pricingRow } = await supabase.from('settings').select('value').eq('key', GROUP_PRICING_KEY).maybeSingle();
    const pricing = cleanGroupPricing(pricingRow?.value);
    if (!link) return ok(res, { group: null, pricing });

    const [{ data: group }, { data: links }] = await Promise.all([
      supabase.from('member_groups').select('id, name, kind, payer_member_id').eq('id', link.group_id).maybeSingle(),
      supabase.from('member_group_links').select('member_id, members(full_name)').eq('group_id', link.group_id),
    ]);
    if (!group) return ok(res, { group: null, pricing });

    return ok(res, {
      group: {
        name: group.name,
        kind: group.kind,
        discount_pct: discountFor(group.kind, pricing),
        you_pay: group.payer_member_id === auth.sub,
        members: (links || []).map((l) => ({
          name: firstName(l.members?.full_name),
          is_payer: l.member_id === group.payer_member_id,
          is_you: l.member_id === auth.sub,
        })),
      },
      pricing,
    });
  } catch (err) {
    console.error('member family error:', err.message);
    return serverError(res, 'Could not load your family or group.');
  }
}
