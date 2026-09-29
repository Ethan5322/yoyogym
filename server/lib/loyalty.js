// Rewards and streaks, and challenges (CLAUDE.md §41.1 Q3) — the rules, with
// no database.
//
// EVERYTHING IS COUNTED FROM CHECK-INS. Points are not a second ledger that
// can drift from reality: a member's points are their check-ins times the
// gym's points per visit, minus what they have claimed. Streaks and challenge
// progress are the same check-ins, counted by week or between two dates.

export const REWARD_RULES_KEY = 'reward_rules';

/** Until the owner says otherwise: 10 points a visit; a week counts at 2 visits. */
export const DEFAULT_REWARD_RULES = Object.freeze({ points_per_visit: 10, streak_target: 2 });

export function cleanRewardRules(value = {}) {
  const ppv = Number.parseInt(value?.points_per_visit, 10);
  const target = Number.parseInt(value?.streak_target, 10);
  return {
    points_per_visit: Number.isFinite(ppv) ? Math.min(1000, Math.max(1, ppv)) : DEFAULT_REWARD_RULES.points_per_visit,
    streak_target: Number.isFinite(target) ? Math.min(7, Math.max(1, target)) : DEFAULT_REWARD_RULES.streak_target,
  };
}

/** Badges for visits, then for weeks in a row. */
export const VISIT_BADGES = [
  [1, 'First visit'],
  [10, '10 visits'],
  [25, '25 visits'],
  [50, '50 visits'],
  [100, '100 visits'],
  [250, '250 visits'],
];
export const STREAK_BADGES = [
  [4, '4 weeks in a row'],
  [12, '12 weeks in a row'],
  [26, 'Half a year in a row'],
  [52, 'A whole year in a row'],
];

const DAY = 86_400_000;

/** Monday of the week a date falls in, as 'YYYY-MM-DD' (UTC). */
export function weekOf(date) {
  const d = new Date(date);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - day * DAY).toISOString().slice(0, 10);
}

/**
 * Weeks in a row with at least `target` visits, counted back from this week.
 * This week only breaks the streak once it is over: on a Tuesday, a member
 * who has not come yet is still on their streak.
 */
export function streakWeeks(visitDates = [], target = 2, now = new Date()) {
  const perWeek = new Map();
  for (const d of visitDates) {
    const w = weekOf(d);
    perWeek.set(w, (perWeek.get(w) ?? 0) + 1);
  }
  let week = weekOf(now);
  let streak = 0;
  if ((perWeek.get(week) ?? 0) >= target) streak += 1;
  for (;;) {
    week = new Date(new Date(`${week}T00:00:00Z`).getTime() - 7 * DAY).toISOString().slice(0, 10);
    if ((perWeek.get(week) ?? 0) >= target) streak += 1;
    else break;
  }
  return streak;
}

/**
 * A member's rewards, all counted from what happened.
 *
 * @param {object} a
 * @param {string[]} a.visits  check-in timestamps
 * @param {object[]} a.claims  { points, status }
 * @param {object} a.rules     cleaned reward rules
 */
export function rewardsSummary({ visits = [], claims = [], rules = DEFAULT_REWARD_RULES, now = new Date() }) {
  const count = visits.length;
  const earned = count * rules.points_per_visit;
  const spent = claims.filter((c) => c.status !== 'cancelled').reduce((n, c) => n + (Number(c.points) || 0), 0);
  const streak = streakWeeks(visits, rules.streak_target, now);
  const badges = [
    ...VISIT_BADGES.map(([n, label]) => ({ key: `visits-${n}`, label, earned: count >= n })),
    ...STREAK_BADGES.map(([n, label]) => ({ key: `streak-${n}`, label, earned: streak >= n })),
  ];
  const next = VISIT_BADGES.find(([n]) => count < n);
  return {
    visits: count,
    earned,
    spent,
    // Never below zero: if the owner lowers points per visit after a claim,
    // a member is not told they owe points.
    balance: Math.max(0, earned - spent),
    streak_weeks: streak,
    streak_target: rules.streak_target,
    points_per_visit: rules.points_per_visit,
    badges,
    next_badge: next ? { label: next[1], visits_to_go: next[0] - count } : null,
  };
}

// ---- challenges -------------------------------------------------------------

/** Where a challenge is, today. */
export function challengeState(challenge, today) {
  if (!challenge.is_active) return 'ended';
  if (today < challenge.starts_on) return 'upcoming';
  if (today > challenge.ends_on) return 'ended';
  return 'running';
}

/** Visits between the challenge's first and last day, inclusive. */
export function challengeProgress(visits = [], challenge) {
  return visits.filter((v) => {
    const day = String(v).slice(0, 10);
    return day >= challenge.starts_on && day <= challenge.ends_on;
  }).length;
}

/** A leaderboard name: first name and an initial — never the whole name. */
export function boardName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Member';
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0];
}

/** Leaderboard rows, highest first; ties keep the order people joined in. */
export function leaderboard(entries = [], limit = 10) {
  return [...entries]
    .filter((e) => e.show_on_board)
    .sort((a, b) => b.progress - a.progress || String(a.joined_at).localeCompare(String(b.joined_at)))
    .slice(0, limit)
    .map((e, i) => ({ rank: i + 1, name: boardName(e.full_name), progress: e.progress, you: Boolean(e.you) }));
}
