import { METERS_PER_DEG_LAT } from './constants.js';

/**
 * Bounds box from center ± radius (PRD §5.2 / §5.3).
 * @param {{ lat: number, lng: number }} center
 * @param {number} radiusMeters
 * @returns {google.maps.LatLngBounds}
 */
export function boundsForRadius(center, radiusMeters) {
  const dLat = radiusMeters / METERS_PER_DEG_LAT;
  const cosLat = Math.cos((center.lat * Math.PI) / 180);
  const dLng = radiusMeters / (METERS_PER_DEG_LAT * Math.max(cosLat, 0.000001));

  return new google.maps.LatLngBounds(
    { lat: center.lat - dLat, lng: center.lng - dLng },
    { lat: center.lat + dLat, lng: center.lng + dLng }
  );
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
 * @param {number} lat
 * @param {number} lng
 * @returns {string | null} error message, or null if valid
 */
export function validateLatLng(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return 'Enter numeric latitude and longitude.';
  }
  if (lat < -90 || lat > 90) {
    return 'Latitude must be between −90 and 90.';
  }
  if (lng < -180 || lng > 180) {
    return 'Longitude must be between −180 and 180.';
  }
  return null;
}
