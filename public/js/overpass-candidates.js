/**
 * Client helper: fetch Overpass POIs via server proxy and shape as candidate dots.
 */

import { distanceMeters, generateCandidateDots } from './dots.js';

/**
 * @typedef {{ id: string, lat: number, lng: number, selected: boolean, name?: string | null, source?: 'overpass' | 'random' }} CandidateDot
 */

/**
 * @param {{
 *   center: { lat: number, lng: number },
 *   radiusMiles: number,
 *   count: number,
 *   minSpacingMeters?: number,
 *   fillRandom?: boolean,
 *   fetchFn?: typeof fetch,
 * }} opts
 * @returns {Promise<
 *   | { ok: true, candidates: CandidateDot[], overpassCount: number, filledRandom: number, queryRadiusMiles: number }
 *   | { ok: false, error: string }
 * >}
 */
export async function loadOverpassCandidates({
  center,
  radiusMiles,
  count,
  minSpacingMeters = 0,
  fillRandom = true,
  fetchFn = fetch,
}) {
  const limit = Math.min(200, Math.max(count * 4, count));
  const params = new URLSearchParams({
    lat: String(center.lat),
    lng: String(center.lng),
    radiusMiles: String(radiusMiles),
    limit: String(limit),
  });
  const path = `/api/overpass?${params.toString()}`;

  let res;
  try {
    res = await fetchFn(path);
  } catch {
    return {
      ok: false,
      error:
        'OpenStreetMap request failed. Check your connection, or switch to random targets.',
    };
  }

  let body;
  try {
    body = await res.json();
  } catch {
    return {
      ok: false,
      error: 'OpenStreetMap returned an unreadable response.',
    };
  }

  if (!res.ok) {
    return {
      ok: false,
      error:
        typeof body?.error === 'string'
          ? body.error
          : 'OpenStreetMap query failed. Try again, or use random targets.',
    };
  }

  const places = Array.isArray(body?.places) ? body.places : [];
  const queryRadiusMiles =
    typeof body?.queryRadiusMiles === 'number'
      ? body.queryRadiusMiles
      : radiusMiles;

  const spaced = pickSpacedPlaces(places, {
    count,
    minSpacingMeters,
  });

  /** @type {CandidateDot[]} */
  const candidates = spaced.map((place, index) => ({
    id: candidateIdAt(index),
    lat: place.lat,
    lng: place.lng,
    selected: false,
    name: typeof place.name === 'string' ? place.name : null,
    source: 'overpass',
  }));

  let filledRandom = 0;
  if (fillRandom && candidates.length < count) {
    const need = count - candidates.length;
    const fillers = generateCandidateDots({
      center,
      radiusMiles,
      count: need,
      minSpacingMeters,
    });
    for (const filler of fillers) {
      const tooClose =
        minSpacingMeters > 0 &&
        candidates.some(
          (dot) => distanceMeters(dot, filler) < minSpacingMeters
        );
      if (tooClose) continue;
      candidates.push({
        id: candidateIdAt(candidates.length),
        lat: filler.lat,
        lng: filler.lng,
        selected: false,
        name: null,
        source: 'random',
      });
      filledRandom += 1;
      if (candidates.length >= count) break;
    }

    // Keep count exact when packing still falls short (same as random generator).
    while (candidates.length < count) {
      const [extra] = generateCandidateDots({
        center,
        radiusMiles,
        count: 1,
        minSpacingMeters: 0,
      });
      candidates.push({
        id: candidateIdAt(candidates.length),
        lat: extra.lat,
        lng: extra.lng,
        selected: false,
        name: null,
        source: 'random',
      });
      filledRandom += 1;
    }
  }

  if (candidates.length === 0) {
    return {
      ok: false,
      error:
        'No OpenStreetMap places found in this radius. Widen the area, or switch to random targets.',
    };
  }

  return {
    ok: true,
    candidates,
    overpassCount: spaced.length,
    filledRandom,
    queryRadiusMiles,
  };
}

/**
 * @param {number} index zero-based
 */
export function candidateIdAt(index) {
  return `d-${String(index + 1).padStart(2, '0')}`;
}

/**
 * Greedy spacing filter — keep first-seen order from Overpass.
 * @param {Array<{ lat: number, lng: number, name?: string | null }>} places
 * @param {{ count: number, minSpacingMeters?: number }} opts
 */
export function pickSpacedPlaces(places, { count, minSpacingMeters = 0 }) {
  /** @type {Array<{ lat: number, lng: number, name?: string | null }>} */
  const kept = [];
  for (const place of places) {
    if (
      !Number.isFinite(place.lat) ||
      !Number.isFinite(place.lng) ||
      place.lat < -90 ||
      place.lat > 90 ||
      place.lng < -180 ||
      place.lng > 180
    ) {
      continue;
    }
    const tooClose =
      minSpacingMeters > 0 &&
      kept.some((dot) => distanceMeters(dot, place) < minSpacingMeters);
    if (tooClose) continue;
    kept.push(place);
    if (kept.length >= count) break;
  }
  return kept;
}
