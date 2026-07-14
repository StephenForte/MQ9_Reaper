/**
 * Client helper for GET /api/geocode/reverse.
 */

/**
 * @typedef {{
 *   ok: true,
 *   formattedAddress: string,
 *   addressComponents: object[],
 *   types: string[],
 *   results: object[],
 * } | {
 *   ok: false,
 *   error: string,
 *   status: number,
 * }} ReverseGeocodeResult
 */

/**
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<ReverseGeocodeResult>}
 */
export async function fetchReverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `/api/geocode/reverse?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error:
          typeof body.error === 'string'
            ? body.error
            : 'Reverse geocoding request failed.',
      };
    }
    return {
      ok: true,
      formattedAddress:
        typeof body.formattedAddress === 'string' ? body.formattedAddress : '',
      addressComponents: Array.isArray(body.addressComponents)
        ? body.addressComponents
        : [],
      types: Array.isArray(body.types) ? body.types : [],
      results: Array.isArray(body.results) ? body.results : [],
    };
  } catch {
    return {
      ok: false,
      status: 0,
      error: 'Reverse geocoding request failed.',
    };
  }
}
