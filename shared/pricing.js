// Pure pricing logic — the SINGLE source of truth shared by the frontend
// (for display in the chatbot summary) and the serverless /api/register
// function (authoritative amounts saved to the DB). No DOM, no Node APIs.
//
// All base prices come from the gym.plans table; contract discounts come from
// the gym.settings table. Nothing here is hardcoded per-gym — these are just
// the calculation rules.

export const DURATION_MONTHS = {
  month_to_month: null,
  '3_month': 3,
  '6_month': 6,
  '12_month': 12,
};

export const DURATION_LABELS = {
  month_to_month: 'Month-to-Month',
  '3_month': '3 Month Contract',
  '6_month': '6 Month Contract',
  '12_month': '12 Month Contract',
};

export const DEFAULT_CONTRACT_DISCOUNTS = {
  month_to_month: 0,
  '3_month': 0,
  '6_month': 5,
  '12_month': 10,
};

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function formatZAR(n) {
  return (
    'R' +
    Number(n || 0).toLocaleString('en-ZA', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

/** Joining fee with the promotional override applied when present. */
export function effectiveJoiningFee(plan) {
  return plan.promo_joining_fee != null && plan.promo_joining_fee !== ''
    ? Number(plan.promo_joining_fee)
    : Number(plan.joining_fee || 0);
}

/** Discounted monthly price for a full-membership plan + contract duration. */
export function monthlyForDuration(plan, duration, discounts = DEFAULT_CONTRACT_DISCOUNTS) {
  const base = Number(plan.monthly_price || 0);
  const disc = Number((discounts || {})[duration] || 0);
  return round2(base * (1 - disc / 100));
}

/**
 * Normalise a chosen plan (+ duration) into a complete pricing object used
 * for the summary, the success screen, and the DB membership record.
 */
export function computeMembership(plan, duration, discounts = DEFAULT_CONTRACT_DISCOUNTS) {
  const base = {
    visit_type: plan.visit_type,
    plan_id: plan.id,
    plan_name: plan.name,
    tier: plan.tier || null,
    contract_duration: null,
    contract_label: null,
    joining_fee: 0,
    monthly_amount: 0,
    recurring_amount: 0,
    amount_today: 0,
    contract_value: null,
    sessions_total: null,
  };

  if (plan.visit_type === 'full') {
    const joining = effectiveJoiningFee(plan);
    const monthly = monthlyForDuration(plan, duration, discounts);
    const months = DURATION_MONTHS[duration];
    return {
      ...base,
      contract_duration: duration,
      contract_label: DURATION_LABELS[duration],
      joining_fee: round2(joining),
      monthly_amount: monthly,
      recurring_amount: monthly,
      amount_today: round2(joining + monthly),
      contract_value: months ? round2(months * monthly) : null,
    };
  }

  if (plan.visit_type === 'session_pack') {
    return {
      ...base,
      amount_today: round2(plan.session_pack_price),
      sessions_total: plan.session_pack_size || null,
    };
  }

  if (plan.visit_type === 'day_pass') {
    return { ...base, amount_today: round2(plan.day_pass_price) };
  }

  if (plan.visit_type === 'trial') {
    return { ...base, amount_today: round2(plan.trial_price) };
  }

  return base;
}

/** Sum of selected add-on prices (once-off + first month of recurring). */
export function addonsTotal(addons = []) {
  return round2(addons.reduce((sum, a) => sum + Number(a.price || 0), 0));
}

/** Grand total due today = membership amount today + add-ons total. */
export function totalDueToday(membership, addons = []) {
  return round2((membership?.amount_today || 0) + addonsTotal(addons));
}
