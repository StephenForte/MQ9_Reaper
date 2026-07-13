import { METERS_PER_DEG_LAT, METERS_PER_MILE } from './constants.js';

/**
 * Approximate great-circle distance in meters (PRD §5.3 scale).
 * @param {{ lat: number, lng: number }} a
 * @param {{ lat: number, lng: number }} b
 */
export function distanceMeters(a, b) {
  const midLatRad = (((a.lat + b.lat) / 2) * Math.PI) / 180;
  const dLat = (a.lat - b.lat) * METERS_PER_DEG_LAT;
  const dLng =
    (a.lng - b.lng) * METERS_PER_DEG_LAT * Math.max(Math.cos(midLatRad), 0.000001);
  return Math.hypot(dLat, dLng);
}

/**
 * One uniform-disk sample around center (PRD §5.3).
 * @param {{ lat: number, lng: number }} center
 * @param {number} radiusMeters
 * @param {() => number} [random]
 */
export function samplePointInDisk(center, radiusMeters, random = Math.random) {
  const u = random();
  const v = random();
  const r = radiusMeters * Math.sqrt(u);
  const theta = 2 * Math.PI * v;
  const dxMeters = r * Math.cos(theta);
  const dyMeters = r * Math.sin(theta);

  const dLat = dyMeters / METERS_PER_DEG_LAT;
  const cosLat = Math.cos((center.lat * Math.PI) / 180);
  const dLng = dxMeters / (METERS_PER_DEG_LAT * Math.max(cosLat, 0.000001));

  return {
    lat: center.lat + dLat,
    lng: center.lng + dLng,
  };
}

/**
 * Area-uniform dots inside the radius, with optional minimum spacing (Q4).
 * Close is fine; overlap is not — rejection sampling retries candidates.
 *
 * @param {{
 *   center: { lat: number, lng: number },
 *   radiusMiles: number,
 *   count: number,
 *   minSpacingMeters?: number,
 *   maxAttemptsPerDot?: number,
 *   random?: () => number,
 * }} opts
 * @returns {{ id: string, lat: number, lng: number, selected: boolean }[]}
 */
export function generateCandidateDots({
  center,
  radiusMiles,
  count,
  minSpacingMeters = 0,
  maxAttemptsPerDot = 80,
  random = Math.random,
}) {
  const radiusMeters = radiusMiles * METERS_PER_MILE;
  /** @type {{ id: string, lat: number, lng: number, selected: boolean }[]} */
  const dots = [];

  for (let i = 0; i < count; i += 1) {
    let placed = null;
    const attempts = Math.max(1, maxAttemptsPerDot);

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const candidate = samplePointInDisk(center, radiusMeters, random);
      const tooClose =
        minSpacingMeters > 0 &&
        dots.some((dot) => distanceMeters(dot, candidate) < minSpacingMeters);
      if (!tooClose) {
        placed = candidate;
        break;
      }
    }

    // If packing fails under the spacing constraint, keep the last try so count stays exact.
    if (!placed) {
      placed = samplePointInDisk(center, radiusMeters, random);
    }

    const n = String(i + 1).padStart(2, '0');
    dots.push({
      id: `d-${n}`,
      lat: placed.lat,
      lng: placed.lng,
      selected: false,
    });
  }

  return dots;
}
