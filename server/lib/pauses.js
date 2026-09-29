// "Pause my membership" (CLAUDE.md §41.1 Q3) — the rules, with no database.
//
// A member pauses from the app within the owner's rules. While paused they
// cannot check in (check-in already refuses anyone not "active"), and their
// membership's end date moves on by the days paused, so a pause costs them
// nothing. The daily job ends a pause on its last day; the member can end it
// early, and the unused days are taken back off the end date.
//
// Dates are calendar days as 'YYYY-MM-DD' strings. A pause of N days starting
// today covers today and the N-1 days after it; the member is back on day N+1.

export const PAUSE_RULES_KEY = 'pause_rules';

/** What a gym allows until its owner says otherwise. */
export const DEFAULT_PAUSE_RULES = Object.freeze({ min_days: 7, max_days: 30, max_per_year: 2, fee: 0 });

const int = (v, lo, hi, fallback) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

/** The owner's rules, cleaned: whole days within sensible bounds, min ≤ max. */
export function cleanPauseRules(value = {}) {
  const min = int(value?.min_days, 1, 90, DEFAULT_PAUSE_RULES.min_days);
  const max = int(value?.max_days, min, 180, Math.max(min, DEFAULT_PAUSE_RULES.max_days));
  const fee = Number(value?.fee);
  return {
    min_days: min,
    max_days: max,
    max_per_year: int(value?.max_per_year, 1, 12, DEFAULT_PAUSE_RULES.max_per_year),
    fee: Number.isFinite(fee) && fee > 0 ? Math.round(fee * 100) / 100 : 0,
  };
}

export const ymd = (d) => new Date(d).toISOString().slice(0, 10);

export function addDays(dateYmd, days) {
  const d = new Date(`${dateYmd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return ymd(d);
}

const daysBetween = (fromYmd, toYmd) =>
  Math.round((new Date(`${toYmd}T00:00:00Z`) - new Date(`${fromYmd}T00:00:00Z`)) / 86_400_000);

/** The pause still running today, if any. */
export function openPause(pauses = [], today) {
  return pauses.find((p) => !p.resumed_at && p.ends_on >= today && p.starts_on <= today) || null;
}

/** Pauses STARTED in the last 365 days — the "per year" in the rules. */
export function pausesThisYear(pauses = [], today) {
  const since = addDays(today, -365);
  return pauses.filter((p) => p.starts_on > since);
}

/**
 * What is wrong with this pause request, or null.
 *
 * @param {object} a
 * @param {number} a.days
 * @param {object} a.rules      cleaned rules
 * @param {object} a.member     { status }
 * @param {object[]} a.pauses   this member's pauses
 * @param {string} a.today      'YYYY-MM-DD'
 */
export function pauseProblem({ days, rules, member, pauses = [], today }) {
  if (openPause(pauses, today) || member?.status === 'frozen') return 'Your membership is already paused.';
  if (member?.status !== 'active') return 'Only an active membership can be paused. Please see reception.';
  const n = Number(days);
  if (!Number.isInteger(n) || n < rules.min_days || n > rules.max_days) {
    return `Choose between ${rules.min_days} and ${rules.max_days} days.`;
  }
  const used = pausesThisYear(pauses, today).length;
  if (used >= rules.max_per_year) {
    return `You have used your ${rules.max_per_year} pause${rules.max_per_year === 1 ? '' : 's'} for this year.`;
  }
  return null;
}

/** The pause itself: today through the last paused day. */
export function pausePeriod(today, days) {
  return { starts_on: today, ends_on: addDays(today, days - 1), days };
}

/**
 * Ending early: the days not used, which come back off the membership's end
 * date. Today counts as a day back at the gym, not a paused one.
 */
export function unusedDays(pause, today) {
  if (today <= pause.starts_on) return pause.days;
  return Math.max(0, daysBetween(today, pause.ends_on) + 1);
}
