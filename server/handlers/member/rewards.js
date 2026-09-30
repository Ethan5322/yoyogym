// Rewards and streaks, for the member (CLAUDE.md §41.1 Q3).
//   GET                     points, streak, badges, what can be claimed, my claims
//   POST { reward_id }      claim a reward — collected at the gym's desk
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError, failed } from '../../lib/http.js';
import { authenticateMember } from '../../lib/memberauth.js';
import { REWARD_RULES_KEY, cleanRewardRules, rewardsSummary } from '../../lib/loyalty.js';

async function load(supabase, memberId) {
  const [{ data: rulesRow }, { data: visits, error }, { data: claims }, { data: rewards }] = await Promise.all([
    supabase.from('settings').select('value').eq('key', REWARD_RULES_KEY).maybeSingle(),
    // Every check-in counts: points are the visits, never a second ledger.
    supabase.from('checkins').select('checked_in_at').eq('member_id', memberId).limit(5000),
    supabase.from('reward_claims').select('id, reward_name, points, status, created_at').eq('member_id', memberId).order('created_at', { ascending: false }),
    supabase.from('rewards').select('id, name, description, points').eq('is_enabled', true).order('points'),
  ]);
  if (error) throw new Error(error.message);
  const rules = cleanRewardRules(rulesRow?.value);
  const summary = rewardsSummary({ visits: (visits || []).map((v) => v.checked_in_at), claims: claims || [], rules });
  return { summary, claims: claims || [], rewards: rewards || [] };
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;
  const auth = authenticateMember(req, res);
  if (!auth) return;
  const supabase = getSupabase();

  try {
    const { summary, claims, rewards } = await load(supabase, auth.sub);

    if (req.method === 'GET') {
      return ok(res, {
        ...summary,
        rewards: rewards.map((r) => ({ ...r, can_claim: summary.balance >= r.points })),
        claims,
      });
    }

    const { reward_id } = await readJsonBody(req);
    const reward = rewards.find((r) => r.id === reward_id);
    if (!reward) return badRequest(res, 'That reward is not available.');
    if (summary.balance < reward.points) {
      return badRequest(res, `You need ${reward.points - summary.balance} more points for this.`);
    }
    const { data: claim, error } = await supabase
      .from('reward_claims')
      .insert({ reward_id: reward.id, member_id: auth.sub, reward_name: reward.name, points: reward.points })
      .select('id')
      .single();
    if (error) return failed(res, error);

    // Two quick taps could both pass the check above with points for one.
    // Counted again now the claim exists: if it overspent, it is taken back.
    const after = await load(supabase, auth.sub);
    if (after.summary.earned - after.summary.spent < 0) {
      await supabase.from('reward_claims').update({ status: 'cancelled', decided_at: new Date().toISOString() }).eq('id', claim.id);
      return badRequest(res, 'You do not have enough points for that.');
    }
    return ok(res, { claimed: true, message: `Claimed: ${reward.name}. Collect it at the front desk.` });
  } catch (err) {
    console.error('member rewards error:', err.message);
    return serverError(res, 'Could not load your rewards.');
  }
}
