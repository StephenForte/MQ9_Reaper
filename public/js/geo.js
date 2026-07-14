import { METERS_PER_DEG_LAT } from './constants.js';

/**
 * Lat/lng degree offsets for a radius in meters (PRD §5.2 / §5.3).
 * @param {{ lat: number, lng: number }} center
 * @param {number} radiusMeters
 * @returns {{ dLat: number, dLng: number }}
 */
export function radiusOffsetDegrees(center, radiusMeters) {
  const dLat = radiusMeters / METERS_PER_DEG_LAT;
  const cosLat = Math.cos((center.lat * Math.PI) / 180);
  const dLng = radiusMeters / (METERS_PER_DEG_LAT * Math.max(cosLat, 0.000001));
  return { dLat, dLng };
}

/**
 * SW / NE corners for a radius box (pure; used by Maps `fitBounds`).
 * @param {{ lat: number, lng: number }} center
 * @param {number} radiusMeters
 * @returns {{ sw: { lat: number, lng: number }, ne: { lat: number, lng: number } }}
 */
export function boundsCornersForRadius(center, radiusMeters) {
  const { dLat, dLng } = radiusOffsetDegrees(center, radiusMeters);
  return {
    sw: { lat: center.lat - dLat, lng: center.lng - dLng },
    ne: { lat: center.lat + dLat, lng: center.lng + dLng },
  };
}

/**
 * Bounds box from center ± radius (PRD §5.2 / §5.3).
 * @param {{ lat: number, lng: number }} center
 * @param {number} radiusMeters
 * @returns {google.maps.LatLngBounds}
 */
export function boundsForRadius(center, radiusMeters) {
  const { sw, ne } = boundsCornersForRadius(center, radiusMeters);
  return new google.maps.LatLngBounds(sw, ne);
}

/**
 * @param {string} raw
 * @returns {number | null}
 */
export function parseCoordinate(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return n;
}

/**
 * Shared lat/lng range check (forms + §4 schema).
 * @param {unknown} lat
 * @param {unknown} lng
 * @returns {string | null} error message, or null if valid
 */
export function validateLatLng(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return 'lat/lng must be numbers.';
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return 'lat/lng must be finite numbers.';
  }
  if (lat < -90 || lat > 90) {
    return 'Latitude must be between −90 and 90.';
  }
  if (lng < -180 || lng > 180) {
    return 'Longitude must be between −180 and 180.';
  }
  return null;
}
