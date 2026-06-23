// Warm, scripted message helpers for the rule-based conversation engine.
//
// AI-UPGRADE SEAM: today these return hardcoded strings. When an
// ANTHROPIC_API_KEY is later added, a server endpoint can rewrite/enrich
// these messages and the engine can `await` them instead — the rest of the
// flow does not change. No paid API is required for the system to work.

/** Time-of-day greeting (spec 2.3 Step 1). */
export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Returns " Firstname" (with leading space) for friendly inline use, or ''. */
export function firstName(answers = {}) {
  const n = answers.full_name;
  if (!n) return '';
  return ' ' + n.trim().split(/\s+/)[0];
}

const ACKS = [
  'Perfect.',
  'Got it.',
  'Great, thank you.',
  'Awesome.',
  'Noted.',
];

/** A short, varied acknowledgement shown after an answer is accepted. */
export function ack(seed = 0) {
  return ACKS[seed % ACKS.length];
}
