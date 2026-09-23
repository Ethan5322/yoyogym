// Showing a page of a long list, and saying how long the list is.
//
// The registry, the owner list and the audit log all had a hard cap and no way
// past it. At ten thousand gyms the registry showed two hundred and silently
// hid nine thousand eight hundred.
//
// That is worse than a missing feature. A list that stops is obviously
// incomplete; a list that ENDS looks finished, and somebody will conclude a gym
// does not exist because it was on page four.
//
// So the total is always shown, even when it is larger than one page — the
// number is the honest part, and the navigation is what makes it usable.

/** Rows per page. Enough to scan, few enough to render fast. */
export const PAGE_SIZE = 50;

/**
 * Work out what to fetch for a requested page.
 *
 * Refuses nonsense rather than coercing it: `?page=-1` and `?page=abc` both
 * become page one, because a negative offset is a database error and a
 * confusing one.
 */
export function pageRequest(raw, { size = PAGE_SIZE } = {}) {
  const asked = Number.parseInt(raw, 10);
  const page = Number.isInteger(asked) && asked > 0 ? asked : 1;

  return {
    page,
    size,
    from: (page - 1) * size,
    // Inclusive, which is what PostgREST's .range() expects.
    to: page * size - 1,
  };
}

/**
 * Describe where the reader is, for the screen.
 *
 * @param {object} args { page, size, total, returned }
 */
export function pageState({ page = 1, size = PAGE_SIZE, total = null, returned = 0 } = {}) {
  const first = returned === 0 ? 0 : (page - 1) * size + 1;
  const last = (page - 1) * size + returned;

  // A total we do not have is not zero — the count query can fail on its own,
  // and saying "of 0" while showing fifty rows is a contradiction the reader
  // has to resolve.
  const known = Number.isInteger(total);

  return {
    page,
    size,
    total: known ? total : null,
    first,
    last,
    hasPrev: page > 1,
    // Without a total, "is there more" is inferred from a full page. It can be
    // wrong by exactly one page — offering a Next that lands on an empty list
    // — which is a smaller cost than hiding rows that exist.
    hasNext: known ? last < total : returned === size,
    label: known
      ? total === 0
        ? 'None'
        : `Showing ${first}–${last} of ${total}`
      : `Showing ${first}–${last}`,
  };
}

/**
 * The query string for another page, keeping the filters the reader set.
 *
 * Losing a search when you turn a page is the single most irritating thing a
 * paginated list can do.
 */
export function pageLink(basePath, params, page) {
  const q = new URLSearchParams();

  for (const [key, value] of Object.entries(params || {})) {
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      q.set(key, String(value));
    }
  }

  if (page > 1) q.set('page', String(page));
  const query = q.toString();

  return query ? `${basePath}?${query}` : basePath;
}
