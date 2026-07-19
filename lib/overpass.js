/**
 * Overpass API (OpenStreetMap) helper for real-world POI candidates.
 * Queried from the server so User-Agent, timeouts, and query bounds stay off the browser.
 */

const METERS_PER_MILE = 1609.344;
const DEFAULT_ENDPOINT = 'https://overpass-api.de/api/interpreter';
const DEFAULT_TIMEOUT_MS = 25_000;
const MAX_RADIUS_MILES = 25;
const MAX_LIMIT = 200;
const USER_AGENT = 'MQ9-Reaper/1.0 (target-selection; OpenStreetMap Overpass client)';

/**
 * @typedef {{
 *   lat: number,
 *   lng: number,
 *   name: string | null,
 *   osmType: string,
 *   osmId: number,
 *   kind: string | null,
 * }} OverpassPlace
 */

/**
 * @param {Record<string, string> | undefined} tags
 * @returns {string | null}
 */
export function nameFromOsmTags(tags) {
  if (!tags || typeof tags !== 'object') return null;
  const named = tags.name || tags['name:en'] || tags.ref;
  if (typeof named === 'string' && named.trim()) return named.trim();

  const kind =
    tags.amenity ||
    tags.leisure ||
    tags.tourism ||
    tags.historic ||
    tags.power ||
    tags.man_made ||
    null;
  if (typeof kind === 'string' && kind.trim()) {
    return kind.trim().replace(/_/g, ' ');
  }
  return null;
}

/**
 * @param {Record<string, string> | undefined} tags
 * @returns {string | null}
 */
export function kindFromOsmTags(tags) {
  if (!tags || typeof tags !== 'object') return null;
  const kind =
    tags.amenity ||
    tags.leisure ||
    tags.tourism ||
    tags.historic ||
    tags.power ||
    tags.man_made ||
    null;
  return typeof kind === 'string' && kind.trim() ? kind.trim() : null;
}

/**
 * Build Overpass QL for game-relevant structures inside a radius disk.
 * @param {{ lat: number, lng: number, radiusMeters: number }} opts
 */
export function buildOverpassQuery({ lat, lng, radiusMeters }) {
  const r = Math.round(radiusMeters);
  const around = `around:${r},${lat},${lng}`;
  const amenity =
    'school|university|hospital|clinic|place_of_worship|fuel|police|fire_station|townhall|community_centre';
  const leisure = 'park|stadium|sports_centre|pitch';
  const tourism = 'museum|attraction|viewpoint|zoo';
  const manMade = 'tower|water_tower|lighthouse';

  return `[out:json][timeout:25];
(
  node["amenity"~"^(${amenity})$"](${around});
  node["leisure"~"^(${leisure})$"](${around});
  node["historic"](${around});
  node["tourism"~"^(${tourism})$"](${around});
  node["power"="substation"](${around});
  node["man_made"~"^(${manMade})$"](${around});
  way["amenity"~"^(${amenity})$"](${around});
  way["leisure"~"^(${leisure})$"](${around});
  way["historic"](${around});
  way["tourism"~"^(${tourism})$"](${around});
  way["power"="substation"](${around});
  way["man_made"~"^(${manMade})$"](${around});
);
out center tags;`;
}

/**
 * @param {unknown} element
 * @returns {OverpassPlace | null}
 */
export function placeFromOverpassElement(element) {
  if (!element || typeof element !== 'object') return null;
  const el = /** @type {Record<string, unknown>} */ (element);
  const type = typeof el.type === 'string' ? el.type : '';
  const id = typeof el.id === 'number' ? el.id : Number(el.id);
  if (!type || !Number.isFinite(id)) return null;

  let lat;
  let lng;
  if (typeof el.lat === 'number' && typeof el.lon === 'number') {
    lat = el.lat;
    lng = el.lon;
  } else if (el.center && typeof el.center === 'object') {
    const center = /** @type {{ lat?: unknown, lon?: unknown }} */ (el.center);
    lat = typeof center.lat === 'number' ? center.lat : Number(center.lat);
    lng = typeof center.lon === 'number' ? center.lon : Number(center.lon);
  } else {
    return null;
  }

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return null;
  }

  const tags =
    el.tags && typeof el.tags === 'object'
      ? /** @type {Record<string, string>} */ (el.tags)
      : undefined;

  return {
    lat,
    lng,
    name: nameFromOsmTags(tags),
    osmType: type,
    osmId: id,
    kind: kindFromOsmTags(tags),
  };
}

/**
 * @param {unknown} data
 * @param {number} [limit]
 * @returns {OverpassPlace[]}
 */
export function placesFromOverpassResponse(data, limit = MAX_LIMIT) {
  const cap = Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit)));
  if (!data || typeof data !== 'object') return [];
  const elements = /** @type {{ elements?: unknown }} */ (data).elements;
  if (!Array.isArray(elements)) return [];

  /** @type {OverpassPlace[]} */
  const places = [];
  const seen = new Set();

  for (const element of elements) {
    const place = placeFromOverpassElement(element);
    if (!place) continue;
    const key = `${place.osmType}/${place.osmId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    places.push(place);
    if (places.length >= cap) break;
  }

  return places;
}

/**
 * @param {{
 *   lat: number,
 *   lng: number,
 *   radiusMiles: number,
 *   limit?: number,
 *   endpoint?: string,
 *   fetchFn?: typeof fetch,
 *   timeoutMs?: number,
 * }} opts
 * @returns {Promise<
 *   | { ok: true, places: OverpassPlace[], queryRadiusMiles: number }
 *   | { ok: false, status: number, error: string }
 * >}
 */
export async function queryOverpassPlaces(opts) {
  const {
    lat,
    lng,
    radiusMiles,
    limit = 75,
    endpoint = process.env.OVERPASS_API_URL || DEFAULT_ENDPOINT,
    fetchFn = fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = opts;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, status: 400, error: 'Pass numeric lat and lng.' };
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { ok: false, status: 400, error: 'lat/lng out of range.' };
  }
  if (!Number.isFinite(radiusMiles) || !(radiusMiles > 0)) {
    return { ok: false, status: 400, error: 'radiusMiles must be a number > 0.' };
  }

  const queryRadiusMiles = Math.min(radiusMiles, MAX_RADIUS_MILES);
  const radiusMeters = queryRadiusMiles * METERS_PER_MILE;
  const query = buildOverpassQuery({ lat, lng, radiusMeters });
  const cap = Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit)));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let upstream;
    try {
      upstream = await fetchFn(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          Accept: 'application/json',
          'User-Agent': USER_AGENT,
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
    } catch (err) {
      const aborted =
        err &&
        typeof err === 'object' &&
        'name' in err &&
        /** @type {{ name?: string }} */ (err).name === 'AbortError';
      return {
        ok: false,
        status: 502,
        error: aborted
          ? 'OpenStreetMap query timed out. Try a smaller radius, or use random targets.'
          : 'OpenStreetMap service unreachable. Try again, or use random targets.',
      };
    }

    if (!upstream.ok) {
      return {
        ok: false,
        status: 502,
        error: 'OpenStreetMap query failed. Try again, or use random targets.',
      };
    }

    let data;
    try {
      data = await upstream.json();
    } catch {
      return {
        ok: false,
        status: 502,
        error: 'OpenStreetMap returned an unreadable response.',
      };
    }

    if (data && typeof data === 'object' && data.remark && !data.elements) {
      return {
        ok: false,
        status: 502,
        error: 'OpenStreetMap query was rejected. Try a smaller radius.',
      };
    }

    return {
      ok: true,
      places: placesFromOverpassResponse(data, cap),
      queryRadiusMiles,
    };
  } finally {
    clearTimeout(timer);
  }
}

export const OVERPASS_MAX_RADIUS_MILES = MAX_RADIUS_MILES;
export const OVERPASS_MAX_LIMIT = MAX_LIMIT;
