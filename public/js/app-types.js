/**
 * Shared AppConfig typedef for Selection / Review / boot.
 * Runtime config still comes from GET /api/config.
 *
 * @typedef {{ lat: number, lng: number }} LatLng
 * @typedef {{
 *   mapsApiKey: string,
 *   adminConfigured?: boolean,
 *   defaults: {
 *     radiusMiles: number,
 *     dotCount: number,
 *     minSelections: number,
 *     maxSelections: number,
 *     blockExtraSelections: boolean,
 *     minDotSpacingMeters: number,
 *     mapType: string,
 *     radiusUnit: string,
 *     confirmOnRecenter: boolean,
 *     seededRng: boolean,
 *     center: LatLng,
 *   }
 * }} AppConfig
 */

export {};
