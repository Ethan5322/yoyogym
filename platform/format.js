// Turning stored values into things a person reads.
//
// The panel rendered `2026-09-23T14:32:07.481Z` in ten places. That is not a
// date, it is a serialisation format — and a screen full of them costs the
// reader a translation on every line, which is exactly the tax a panel is
// supposed to remove.
//
// Everything here is pure and takes `now`, so "today" and "3 days ago" are
// testable rather than dependent on when the suite runs.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n) => String(n).padStart(2, '0');

/**
 * A date a person can read at a glance.
 *
 * Recent things get a relative form, because "2 hours ago" answers the
 * question a reader actually has about a recent event. Older things get an
 * absolute date, because "1,847 hours ago" answers nothing.
 *
 * The cut-over is a week: beyond that, nobody counts in days.
 */
export function when(value, now = new Date()) {
  if (!value) return '—';

  const then = new Date(value);
  if (Number.isNaN(then.getTime())) return '—';

  const seconds = Math.round((now.getTime() - then.getTime()) / 1000);

  // In the future — a trial end, a next billing date. Said as a date, because
  // "in 27 days" is harder to plan around than the day itself.
  if (seconds < -60) return absolute(then);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) {
    const m = Math.round(seconds / 60);
    return `${m} minute${m === 1 ? '' : 's'} ago`;
  }
  if (seconds < 86400) {
    const h = Math.round(seconds / 3600);
    return `${h} hour${h === 1 ? '' : 's'} ago`;
  }
  if (seconds < 7 * 86400) {
    const d = Math.round(seconds / 86400);
    return d === 1 ? 'yesterday' : `${d} days ago`;
  }

  return absolute(then);
}

/** 23 Sep 2026. Unambiguous in every country, unlike 09/23 or 23/09. */
export function absolute(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** The same, with the time, for an audit log where the hour matters. */
export function exact(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${absolute(d)}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/**
 * Cents as money.
 *
 * Never rounds to whole units: a price of R499.50 shown as "R500" is a
 * different price, and somebody will eventually argue about the difference.
 */
export function money(cents, currency = 'ZAR') {
  // NULL IS NOT ZERO. `Number(null)` is 0 and `Number.isFinite(0)` is true, so
  // a looser check renders an unknown price as "ZAR 0.00" — a confident, wrong
  // answer about money. This is the third time this exact trap has appeared in
  // this codebase; an amount that is absent is a dash.
  if (cents === null || cents === undefined || cents === '') return '—';

  const n = Number(cents);
  if (!Number.isFinite(n)) return '—';

  return `${currency} ${(n / 100).toFixed(2)}`;
}

/**
 * A count, said in words where that reads better.
 *
 * "No gyms yet" is a sentence. "0 gyms" is a cell in a spreadsheet.
 */
export function count(n, singular, plural = null) {
  const value = Number(n);
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return `No ${plural || singular + 's'}`;
  return `${value} ${value === 1 ? singular : plural || singular + 's'}`;
}

/** How long until something, for a trial or a grace window. */
export function until(value, now = new Date()) {
  if (!value) return '—';
  const then = new Date(value);
  if (Number.isNaN(then.getTime())) return '—';

  // Compared by CALENDAR DAY, not by elapsed hours. A trial ending in twelve
  // hours ends today, and `Math.ceil` on the difference called that tomorrow —
  // which is the wrong answer on exactly the day somebody needs to act.
  const startOfDay = (d) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const days = Math.round((startOfDay(then) - startOfDay(now)) / 86400000);

  if (days < 0) return `${absolute(then)} (passed)`;
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days <= 14) return `in ${days} days`;
  return absolute(then);
}
