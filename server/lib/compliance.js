// Phase 99 Section C — Automated Plan Compliance Engine.
// Pure logic + config loader shared by the scan card, check-in enforcement,
// attendance, class booking, and member portal. Config is editable in
// Admin → Settings (key "compliance"); sensible defaults are used otherwise.

export const DEFAULT_COMPLIANCE = {
  peak_hours: { start: 17, end: 20 }, // 17:00–20:00 considered peak
  session_minutes: 120, // allowed session length
  capacity: 120,
  plan_rules: {
    basic: { access: 'off_peak', classes_per_month: 0, pt_per_month: 0, guest: false },
    standard: { access: 'anytime', classes_per_month: 4, pt_per_month: 0, guest: false },
    premium: { access: 'anytime', classes_per_month: -1, pt_per_month: 1, guest: false },
    vip: { access: 'anytime', classes_per_month: -1, pt_per_month: 4, guest: true },
  },
  adherence: { excellent: 90, good: 70, needs: 50 },
  weekly_expected: { '1_2': 1.5, '3_4': 3.5, '5_6': 5.5, daily: 7 },
};

// preferred_time -> usual training window
export const SLOTS = {
  early_morning: { start: 5, end: 8, label: '05:00 – 08:00' },
  morning: { start: 8, end: 12, label: '08:00 – 12:00' },
  afternoon: { start: 12, end: 17, label: '12:00 – 17:00' },
  evening: { start: 17, end: 21, label: '17:00 – 21:00' },
  flexible: null,
};

export async function loadCompliance(supabase) {
  const { data } = await supabase.from('settings').select('value').eq('key', 'compliance').maybeSingle();
  const v = data?.value || {};
  return {
    ...DEFAULT_COMPLIANCE,
    ...v,
    peak_hours: { ...DEFAULT_COMPLIANCE.peak_hours, ...(v.peak_hours || {}) },
    plan_rules: { ...DEFAULT_COMPLIANCE.plan_rules, ...(v.plan_rules || {}) },
    adherence: { ...DEFAULT_COMPLIANCE.adherence, ...(v.adherence || {}) },
    weekly_expected: { ...DEFAULT_COMPLIANCE.weekly_expected, ...(v.weekly_expected || {}) },
  };
}

export const rulesFor = (config, tier) =>
  config.plan_rules[tier] || { access: 'anytime', classes_per_month: -1, pt_per_month: 0 };

export function isPeak(config, date = new Date()) {
  const h = date.getHours();
  return h >= config.peak_hours.start && h < config.peak_hours.end;
}

/**
 * Evaluate access for the scan card + check-in.
 * Returns { banner, reasons[], is_violation, is_extra, is_overtime, access_blocked, slot_label }.
 *   banner: 'on_schedule' | 'extra' | 'violation' | 'not_scheduled'
 */
export function evaluateAccess({ member, tier, preferredTime, openInsideMinutes, config, now = new Date() }) {
  const rules = rulesFor(config, tier);
  const slot = SLOTS[preferredTime];
  const reasons = [];

  if (member.status === 'suspended')
    return { banner: 'violation', reasons: ['Membership suspended'], is_violation: true, access_blocked: true, slot_label: slot?.label || 'Flexible' };
  if (member.status === 'lapsed')
    return { banner: 'violation', reasons: ['Membership expired'], is_violation: true, access_blocked: true, slot_label: slot?.label || 'Flexible' };
  if (member.status === 'new')
    return { banner: 'violation', reasons: ['Payment pending — not activated'], is_violation: true, access_blocked: true, slot_label: slot?.label || 'Flexible' };

  // Basic plan: off-peak only
  if (rules.access === 'off_peak' && isPeak(config, now)) {
    reasons.push('Basic plan: peak-hour access not permitted');
    return { banner: 'violation', reasons, is_violation: true, access_blocked: false, slot_label: slot?.label || 'Flexible' };
  }

  // Overtime
  if (openInsideMinutes != null && openInsideMinutes > config.session_minutes) {
    return {
      banner: 'violation',
      reasons: [`Overtime: ${openInsideMinutes - config.session_minutes} min over`],
      is_overtime: true,
      access_blocked: false,
      slot_label: slot?.label || 'Flexible',
    };
  }

  // Schedule slot adherence
  const h = now.getHours();
  if (slot && (h < slot.start || h >= slot.end)) {
    reasons.push('Outside usual training window');
    return { banner: 'extra', reasons, is_extra: true, access_blocked: false, slot_label: slot.label };
  }

  return { banner: 'on_schedule', reasons, access_blocked: false, slot_label: slot?.label || 'Flexible' };
}

/** Expected visits over N days from training frequency. */
export function expectedVisits(config, frequency, days = 30) {
  const weekly = config.weekly_expected[frequency] ?? 2;
  return Math.round(weekly * (days / 7));
}

/** Adherence score + band from visits vs expected. */
export function adherence(config, visits, expected) {
  const score = expected ? Math.min(100, Math.round((visits / expected) * 100)) : 0;
  const a = config.adherence;
  let band, label;
  if (score >= a.excellent) [band, label] = ['excellent', 'EXCELLENT'];
  else if (score >= a.good) [band, label] = ['good', 'GOOD'];
  else if (score >= a.needs) [band, label] = ['needs', 'NEEDS IMPROVEMENT'];
  else [band, label] = ['at_risk', 'AT RISK'];
  return { score, band, label };
}
