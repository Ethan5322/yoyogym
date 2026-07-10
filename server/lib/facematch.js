// Multi-template face gallery matching.
//
// WHY THIS EXISTS
// A single stored face template is a single point in embedding space. It is a
// snapshot of one haircut, one beard length, one face of makeup, under one set
// of lights. When the person changes any of those, their new embedding drifts
// away from that frozen point and a strict threshold rejects them.
//
// The fix has three parts, all implemented here:
//
//  1. GALLERY — each person keeps several templates, captured across different
//     poses at enrolment. A probe is scored against the CLOSEST template, so a
//     member only has to resemble one of their stored looks, not an average of
//     all of them.
//
//  2. PERSON-LEVEL MARGIN — confidence needs the best person to beat the
//     RUNNER-UP PERSON by a margin, not just clear an absolute threshold. This
//     is what stops a look-alike (or a sibling) from being accepted, and it is
//     what lets us keep the absolute threshold permissive enough to survive a
//     new beard.
//
//  3. ADAPTIVE LEARNING — when someone is recognised unambiguously and today's
//     face adds information the gallery does not already hold, that probe is
//     appended as a new template. Appearance drift is absorbed over time
//     instead of accumulating until the member is locked out. Enrolment
//     templates are kept as immutable anchors so the gallery can never walk
//     away from the identity it was registered with.

/** Cosine similarity of two L2-normalised vectors (-1..1, higher = closer). */
export function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return -1;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

/** Euclidean distance between two vectors (lower = closer). */
export function euclidean(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

// Both metrics are expressed as a similarity (higher = closer) so `identify`
// can apply one threshold-and-margin rule to either engine.
export const arcfaceSimilarity = (a, b) => cosine(a, b);
export const faceApiSimilarity = (a, b) => -euclidean(a, b);

/**
 * Read a person's templates out of a database row.
 * Accepts the new `<key>_templates` gallery and falls back to the legacy
 * single-vector column, so members enrolled before the gallery migration keep
 * working until their next successful scan tops the gallery up.
 */
export function templatesOf(row, { arrayKey, legacyKey }) {
  const gallery = Array.isArray(row?.[arrayKey]) ? row[arrayKey] : [];
  const out = [];
  for (const entry of gallery) {
    const v = Array.isArray(entry) ? entry : entry?.v;
    if (Array.isArray(v) && v.length) out.push(v);
  }
  if (!out.length) {
    const legacy = row?.[legacyKey];
    if (Array.isArray(legacy) && legacy.length) out.push(legacy);
  }
  return out;
}

/**
 * Score `probe` against every person's gallery and return the winner.
 *
 * A person's score is their BEST template — the look of theirs that is closest
 * to how they appear right now. `confident` requires that score to clear
 * `threshold` AND to beat the runner-up person by `margin`.
 *
 * @param {number[]} probe
 * @param {{templates: number[][]}[]} people
 * @returns {{person, score, second, confident}}
 */
export function identify(probe, people, { similarity, threshold, margin }) {
  let person = null;
  let score = -Infinity;
  let second = -Infinity;

  for (const candidate of people) {
    let best = -Infinity;
    for (const template of candidate.templates || []) {
      const s = similarity(probe, template);
      if (s > best) best = s;
    }
    if (best > score) {
      second = score;
      score = best;
      person = candidate;
    } else if (best > second) {
      second = best;
    }
  }

  const confident = !!person && score >= threshold && score - second >= margin;
  return { person, score, second, confident };
}

/**
 * Should this verified probe be learned as a new appearance?
 *
 * Two guards, both necessary:
 *  - the match must be well ABOVE the accept threshold (`learnAbove`), so a
 *    borderline accept can never poison a gallery;
 *  - the probe must be far enough from every stored template (`redundantAbove`)
 *    to actually carry new information — otherwise the gallery fills up with
 *    copies of the same look and evicts the diversity we want.
 */
export function shouldLearn(probe, templates, { similarity, score, learnAbove, redundantAbove }) {
  if (!Array.isArray(probe) || !probe.length) return false;
  if (score < learnAbove) return false;
  for (const template of templates) {
    if (similarity(probe, template) >= redundantAbove) return false;
  }
  return true;
}

const entryOf = (v, src) => ({ v, src, at: new Date().toISOString() });

/** Wrap freshly captured vectors as immutable enrolment anchors. */
export function enrolmentGallery(vectors, { max = 5 } = {}) {
  return vectors.filter((v) => Array.isArray(v) && v.length).slice(0, max).map((v) => entryOf(v, 'enrol'));
}

/**
 * Append a learned template to a gallery.
 *
 * Enrolment anchors are never evicted. When the cap is reached the OLDEST
 * learned template goes, so the gallery tracks a rolling window of how the
 * person has actually looked lately.
 */
export function withLearnedTemplate(gallery, vector, { max = 8 } = {}) {
  const existing = (Array.isArray(gallery) ? gallery : [])
    .map((e) => (Array.isArray(e) ? entryOf(e, 'enrol') : e))
    .filter((e) => Array.isArray(e?.v) && e.v.length);

  const anchors = existing.filter((e) => e.src !== 'adaptive');
  const learned = existing.filter((e) => e.src === 'adaptive');
  learned.push(entryOf(vector, 'adaptive'));

  const room = Math.max(0, max - anchors.length);
  return [...anchors, ...learned.slice(Math.max(0, learned.length - room))];
}

// ── Operating points ────────────────────────────────────────────────────────
// ArcFace (InsightFace buffalo_l), cosine similarity on L2-normalised 512-D
// embeddings. Same-person pairs across a haircut/beard/makeup change typically
// land around 0.40–0.60; different people sit below ~0.25. The threshold is
// deliberately below the old 0.45 — the person-level margin, not a punishing
// absolute cut-off, is what keeps look-alikes out.
export const ARCFACE = {
  threshold: Number(process.env.FACE_THRESHOLD || 0.38),
  margin: Number(process.env.FACE_MARGIN || 0.05),
  // Admin panel: a higher bar, since a false accept here is an authorisation
  // breach rather than a turnstile mistake.
  adminThreshold: Number(process.env.FACE_ADMIN_THRESHOLD || 0.45),
  adminMargin: Number(process.env.FACE_ADMIN_MARGIN || 0.08),
  learnAbove: Number(process.env.FACE_LEARN_ABOVE || 0.55),
  redundantAbove: Number(process.env.FACE_LEARN_REDUNDANT || 0.86),
  maxTemplates: Number(process.env.FACE_MAX_TEMPLATES || 8),
};

// face-api.js 128-D fallback, expressed as negative Euclidean distance so the
// same threshold/margin machinery applies. 0.6 is the face-api convention for
// a same-person match.
export const FACEAPI = {
  threshold: -0.6,
  margin: 0.05,
  adminThreshold: -0.52,
  adminMargin: 0.08,
  learnAbove: -0.42,
  redundantAbove: -0.22,
  maxTemplates: 8,
};
