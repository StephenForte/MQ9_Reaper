/**
 * Server-side Google Geocoding proxy (PRD §7.3).
 * Never returns the API key; only lat/lng + formatted address (+ components).
 */

/**
 * @param {object} data
 * @param {string} fallbackError
 */
function mapGeocodeFailure(data, fallbackError) {
  if (data.status === 'ZERO_RESULTS') {
    return {
      ok: false,
      status: 404,
      error: fallbackError,
      googleStatus: data.status,
    };
  }

  console.warn(
    'Geocoding API status:',
    data.status,
    data.error_message || ''
  );

  if (data.status === 'REQUEST_DENIED') {
    const detail = data.error_message || '';
    const referrerIssue = /referer/i.test(detail);
    return {
      ok: false,
      status: 502,
      error: referrerIssue
        ? 'Geocoding key is misconfigured: use a server key without HTTP referrer restrictions (IP restrict or unrestricted app restriction; Geocoding API only).'
        : 'Geocoding was denied. Check GEOCODING_API_KEY and that Geocoding API is enabled.',
      googleStatus: data.status,
    };
  }

  return {
    ok: false,
    status: 502,
    error: 'Geocoding failed. Try again, or use map click / lat-long.',
    googleStatus: data.status,
  };
}

/**
 * @param {URL} url
 * @param {{ networkError: string, unreachableError: string }} messages
 */
async function fetchGeocodeJson(url, messages) {
  let googleRes;
  try {
    googleRes = await fetch(url.toString());
  } catch {
    return {
      ok: false,
      status: 502,
      error: messages.networkError,
    };
  }

  if (!googleRes.ok) {
    return {
      ok: false,
      status: 502,
      error: messages.unreachableError,
    };
  }

  return { ok: true, data: await googleRes.json() };
}

/**
 * @param {string} address
 * @param {string} apiKey
 * @returns {Promise<{ ok: true, lat: number, lng: number, formattedAddress: string, addressComponents: object[], types: string[] } | { ok: false, status: number, error: string, googleStatus?: string }>}
 */
export async function geocodeAddress(address, apiKey) {
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', address);
  url.searchParams.set('key', apiKey);

  const fetched = await fetchGeocodeJson(url, {
    networkError:
      'Geocoding request failed. Try again, or use map click / lat-long.',
    unreachableError:
      'Geocoding service unreachable. Try again, or use map click / lat-long.',
  });
  if (!fetched.ok) return fetched;

  const data = fetched.data;
  if (data.status === 'OK' && data.results?.length) {
    const result = data.results[0];
    const { lat, lng } = result.geometry.location;
    return {
      ok: true,
      lat,
      lng,
      formattedAddress: result.formatted_address || address,
      addressComponents: result.address_components || [],
      types: result.types || [],
    };
  }

  return mapGeocodeFailure(data, "Couldn't find that address");
}

/**
 * Reverse geocode a lat/lng.
 * @param {number} lat
 * @param {number} lng
 * @param {string} apiKey
 * @returns {Promise<{ ok: true, formattedAddress: string, addressComponents: object[], types: string[], results: object[] } | { ok: false, status: number, error: string, googleStatus?: string }>}
 */
export async function reverseGeocode(lat, lng, apiKey) {
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('latlng', `${lat},${lng}`);
  url.searchParams.set('key', apiKey);

  const fetched = await fetchGeocodeJson(url, {
    networkError: 'Reverse geocoding request failed.',
    unreachableError: 'Geocoding service unreachable.',
  });
  if (!fetched.ok) return fetched;

  const data = fetched.data;
  if (data.status === 'OK' && data.results?.length) {
    const result = data.results[0];
    return {
      ok: true,
      formattedAddress: result.formatted_address || '',
      addressComponents: result.address_components || [],
      types: result.types || [],
      results: data.results,
    };
  }

  return mapGeocodeFailure(data, 'No address found for that location.');
}
