// A gym's Yoyo Gyms plan as its owner sees it: free trial, paid until, due —
// and whether a payment can be taken now (CLAUDE.md §48).
//
// ONE DEFINITION, TWO READERS: the gym's admin panel (server/) and the owner's
// Yoyo account page (platform/) may not import each other (D-081), and they
// must never disagree about what the owner owes. So it lives here, like
// shared/features.js (D-106).
//
// Pure: no clock, no network, no database. Every function takes `now`.

/** One paid month, in days — the same month billing has always charged. */
export const MONTH_DAYS = 30;

/**
 * How far ahead an owner may pay: the next month opens for payment once the
 * time already covered ends within this many days. Stops a second click from
 * buying a second month by accident — and a gym covered for years (KOM) is
 * never offered a payment it does not need.
 */
export const PAY_AHEAD_DAYS = 31;

const DAY_MS = 86_400_000;
const at = (value) => {
  const t = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(t) ? t : null;
};

/** When the time already covered ends: the month paid, or the free trial. */
export function coveredUntil(subscription) {
  return subscription?.current_period_end ?? subscription?.trial_ends_at ?? null;
}

/**
 * The month a payment made now buys (CLAUDE.md §48.1 Q3).
 *
 * It starts when the time already covered ends — so paying during the free
 * trial keeps every free day, and nothing is charged again when the trial
 * ends. When that time is already over (a late payment), it starts now.
 */
export function monthBought(covered, now = new Date()) {
  const until = at(covered);
  const start = until !== null && until > now.getTime() ? until : now.getTime();
  return {
    start: new Date(start).toISOString(),
    end: new Date(start + MONTH_DAYS * DAY_MS).toISOString(),
  };
}

/**
 * Where a gym stands with Yoyo Gyms.
 *
 * state:
 *   trial        free trial running, nothing paid yet
 *   trial_ended  the trial is over and nothing has been paid yet
 *   trial_paid   paid during the trial: the free days still run, then the paid month
 *   active       a paid month is running
 *   due          a payment failed; the gym runs until graceEnds
 *   suspended    closed for non-payment; paying reopens it
 *   ended        cancelled or expired — nothing to pay here
 *   none         no subscription at all
 *
 * canPay says whether a payment can be taken NOW; `next` is the month it buys.
 */
export function planStanding(subscription, now = new Date()) {
  if (!subscription) return { state: 'none', canPay: false };

  const t = now.getTime();
  const covered = coveredUntil(subscription);
  const coveredAt = at(covered);
  const trialEndAt = at(subscription.trial_ends_at);
  const base = {
    // The trial opens the day the gym is built (§17), which is when this row is made.
    trialStart: subscription.created_at ?? null,
    trialEnd: subscription.trial_ends_at ?? null,
    paidUntil: null,
    graceEnds: null,
    next: monthBought(covered, now),
  };

  switch (subscription.status) {
    case 'trialing':
      return { ...base, state: trialEndAt !== null && trialEndAt <= t ? 'trial_ended' : 'trial', canPay: true };

    case 'active':
      return {
        ...base,
        state: trialEndAt !== null && trialEndAt > t ? 'trial_paid' : 'active',
        paidUntil: covered,
        canPay: coveredAt === null || coveredAt - t <= PAY_AHEAD_DAYS * DAY_MS,
        // When the next month opens for payment — not said of a gym covered
        // for more than a year (KOM), which has nothing coming up to pay.
        payableFrom:
          coveredAt === null || coveredAt - t > 365 * DAY_MS
            ? null
            : new Date(coveredAt - PAY_AHEAD_DAYS * DAY_MS).toISOString(),
      };

    case 'past_due':
      return { ...base, state: 'due', graceEnds: subscription.grace_ends_at ?? null, canPay: true };

    case 'suspended':
      return { ...base, state: 'suspended', canPay: true };

    default:
      return { ...base, state: 'ended', canPay: false };
  }
}

// Spelled out here, not left to the device: one phone says "Sept", another "Sep".
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayMonth = (t) => `${new Date(t).getUTCDate()} ${MONTHS[new Date(t).getUTCMonth()]}`;

/** "29 Oct 2026" — the owner's dates, the same on every screen. */
export function planDate(value) {
  const t = at(value);
  return t === null ? '' : `${dayMonth(t)} ${new Date(t).getUTCFullYear()}`;
}

/** "29 Sep – 29 Oct 2026"; the year said once when both dates share it. */
export function planRange(from, to) {
  const a = at(from);
  const b = at(to);
  if (a === null || b === null) return '';
  const sameYear = new Date(a).getUTCFullYear() === new Date(b).getUTCFullYear();
  const first = sameYear ? dayMonth(a) : planDate(from);
  return `${first} – ${planDate(to)}`;
}

/** "Visa ending 4081" — Paystack sends the brand in lower case. */
export function cardText(brand, last4) {
  const b = String(brand || 'card').trim();
  return `${b.charAt(0).toUpperCase()}${b.slice(1)} ending ${last4}`;
}

/** "ZAR 999.00 a month", from cents; '' when the plan has no price yet. */
export function planFee(priceCents, currency = 'ZAR') {
  const cents = Number(priceCents);
  if (priceCents === null || priceCents === undefined || !Number.isInteger(cents) || cents <= 0) return '';
  return `${currency || 'ZAR'} ${(cents / 100).toFixed(2)} a month`;
}

/**
 * What the owner reads, from planStanding(): the status line, a note on what
 * paying now buys, and the Pay button's words. The same sentences on the
 * gym's dashboard and the Yoyo account page. Inside the store app there is no
 * note and no button — the status only (§48.1 Q2).
 *
 * @param {object} standing  planStanding(), plus `paidFrom` (current_period_start)
 * @param {object} options   inApp; priced — false when the plan has no price
 *                           yet, so nothing can be paid and no note offers it
 */
export function planWords(standing, { inApp = false, priced = true } = {}) {
  const s = standing || {};
  const trial = planRange(s.trialStart, s.trialEnd);
  const next = s.next ? planRange(s.next.start, s.next.end) : '';

  const status = {
    trial: trial ? `Free trial: ${trial}` : 'Free trial',
    trial_ended: `Your free trial ended on ${planDate(s.trialEnd)}`,
    trial_paid: `Free trial: ${trial} · paid ${planRange(s.paidFrom, s.paidUntil)}`,
    active: `Active — paid until ${planDate(s.paidUntil)}`,
    due: s.graceEnds ? `Payment due — your gym stays open until ${planDate(s.graceEnds)}` : 'Payment due',
    suspended: 'Suspended — pay to reopen your gym',
    ended: 'Your subscription has ended',
  }[s.state] || '';

  // What paying now buys, said before the button, so nobody pays for a month
  // they did not expect (§48.1 Q3).
  const note = inApp || !priced
    ? ''
    : {
      trial: `Nothing to pay until ${planDate(s.trialEnd)}. Pay now and your first paid month runs ${next} — you keep every free day.`,
      trial_ended: `Pay now to keep your gym open. Your paid month runs ${next}.`,
      trial_paid: s.canPay ? `Paying now covers ${next}.` : '',
      active: s.canPay ? `Paying now covers ${next}.` : s.payableFrom ? `The next month can be paid from ${planDate(s.payableFrom)}.` : '',
      due: `Paying now covers ${next}.`,
      suspended: `Paying now reopens your gym straight away and covers ${next}.`,
    }[s.state] || '';

  const button =
    s.state === 'suspended' ? 'Pay and reopen my gym'
      : s.state === 'active' || s.state === 'trial_paid' ? 'Pay monthly fee now'
        : 'Pay now';

  // green: paid · plain: in the free trial · amber: act soon · red: closed
  const tone =
    s.state === 'active' || s.state === 'trial_paid' ? 'good'
      : s.state === 'trial' ? 'calm'
        : s.state === 'suspended' ? 'bad'
          : s.state === 'ended' || s.state === 'none' ? 'calm'
            : 'warn';

  return { status, note, button, tone, urgent: tone === 'warn' || tone === 'bad' };
}
