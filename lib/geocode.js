/**
 * Server-side Google Geocoding proxy (PRD §7.3).
 * Never returns the API key; only lat/lng + formatted address.
 */

/**
 * @param {string} address
 * @param {string} apiKey
 * @returns {Promise<{ ok: true, lat: number, lng: number, formattedAddress: string } | { ok: false, status: number, error: string, googleStatus?: string }>}
 */
async function geocodeAddress(address, apiKey) {
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', address);
  url.searchParams.set('key', apiKey);

  let googleRes;
  try {
    googleRes = await fetch(url.toString());
  } catch {
    return {
      ok: false,
      status: 502,
      error: 'Geocoding request failed. Try again, or use map click / lat-long.',
    };
  }

  if (!googleRes.ok) {
    return {
      ok: false,
      status: 502,
      error: 'Geocoding service unreachable. Try again, or use map click / lat-long.',
    };
  }

  const data = await googleRes.json();

  if (data.status === 'OK' && data.results?.length) {
    const result = data.results[0];
    const { lat, lng } = result.geometry.location;
    return {
      ok: true,
      lat,
      lng,
      formattedAddress: result.formatted_address || address,
    };
  }

  if (data.status === 'ZERO_RESULTS') {
    return {
      ok: false,
      status: 404,
      error: "Couldn't find that address",
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

module.exports = { geocodeAddress };
