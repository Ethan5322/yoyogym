// "Which gyms are near me?" — the pure half of the public gym search.
//
// ============================================================================
// What was wrong
// ============================================================================
//
// The search asked the database for 25 active gyms — any 25, in no order —
// and THEN sorted those by distance. With a handful of gyms that is invisible.
// At ten thousand, "use my location" returned 25 gyms from anywhere on earth,
// neatly ordered, with the member's actual nearest gym almost never among them.
// A sorted list looks authoritative, which made it worse than an unsorted one.
//
// So the database is asked for gyms INSIDE a box around the member first,
// widening only when a box comes back empty. The box is what makes "nearest"
// mean something; the sort only orders what the box found.
//
// And haversineKm() accepted a gym with no coordinates, because
// Number(null) === 0 and 0 is finite. Such a gym was measured as though it
// stood at 0°, 0° in the Gulf of Guinea. A gym with no location now has no
// distance, rather than a confident wrong one.

/** How many gyms a search returns. The screen is a phone. */
export const RESULT_LIMIT = 25;

/** Rows fetched per box, before sorting. More than RESULT_LIMIT so a dense city still sorts correctly. */
export const BOX_FETCH = 200;

/**
 * Search radii, widened in turn until one finds something (D-073: "show the
 * nearest whatever the distance"). A town, a region, a country, then a
 * continent.
 */
export const RADII_KM = [25, 100, 500, 2500];

const KM_PER_DEGREE = 111.32;

/** A real coordinate, or null. Not Number(): null and '' are not zero. */
export function coordinate(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Great-circle distance in km, or null if either point is unknown. */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const pts = [lat1, lon1, lat2, lon2].map(coordinate);
  if (pts.includes(null)) return null;
  const [a1, o1, a2, o2] = pts;

  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(a2 - a1);
  const dLon = toRad(o2 - o1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a1)) * Math.cos(toRad(a2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
}

/**
 * A latitude/longitude box that contains every point within `radiusKm`.
 *
 * Longitude degrees shrink toward the poles, so the box widens with latitude;
 * near a pole it simply spans every longitude. It is deliberately a little
 * generous — the exact distance is computed afterwards, so a box that is too
 * big costs a few rows and a box that is too small loses the nearest gym.
 */
export function boundingBox(lat, lng, radiusKm) {
  const dLat = radiusKm / KM_PER_DEGREE;
  const cos = Math.cos((lat * Math.PI) / 180);
  const dLng = cos < 0.01 ? 180 : Math.min(180, radiusKm / (KM_PER_DEGREE * cos));

  // Crossing the 180° meridian (Fiji, Chukotka) the longitudes wrap: -190 is
  // +170. Rather than two ranges, such a box takes every longitude — a few
  // extra rows, sorted away afterwards, instead of a missed gym.
  const wraps = dLng >= 180 || lng - dLng < -180 || lng + dLng > 180;

  return {
    minLat: Math.max(-90, lat - dLat),
    maxLat: Math.min(90, lat + dLat),
    minLng: wraps ? -180 : lng - dLng,
    maxLng: wraps ? 180 : lng + dLng,
  };
}

/**
 * Measure, drop anything outside the radius, sort nearest first, trim.
 *
 * The radius check matters: a box's corners are further away than its sides,
 * and a gym in the corner of the 25 km box can be 35 km off. Without it, a
 * search could show that gym and omit a nearer one that sits in the NEXT box.
 */
export function nearestFirst(gyms, lat, lng, radiusKm = Infinity, limit = RESULT_LIMIT) {
  return gyms
    .map((g) => ({ ...g, distance_km: haversineKm(lat, lng, g.latitude, g.longitude) }))
    .filter((g) => g.distance_km !== null && g.distance_km <= radiusKm)
    .sort((a, b) => a.distance_km - b.distance_km)
    .slice(0, limit);
}

/**
 * The nearest gyms to a point, widening the search until something is found.
 *
 * @param {(box: object|null, limit: number) => Promise<object[]>} fetchRows
 *        Fetch gyms inside `box`, or — given null — any gyms that HAVE a
 *        location. The database lives behind this; the decisions live here.
 */
export async function nearestGyms(fetchRows, lat, lng) {
  for (const radius of RADII_KM) {
    const found = nearestFirst(await fetchRows(boundingBox(lat, lng, radius), BOX_FETCH), lat, lng, radius);
    if (found.length) return found;
  }
  // Further than any radius from every gym. Rare, and still answered.
  return nearestFirst(await fetchRows(null, 1000), lat, lng);
}

/**
 * Escape a search term for ILIKE.
 *
 * A member typing "100%" or "a_b" is typing text, not a pattern. Unescaped,
 * "%" matches every gym and "_" matches any character.
 */
export function likeTerm(query) {
  return `%${String(query).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
