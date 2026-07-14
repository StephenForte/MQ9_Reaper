/**
 * Place / region naming helpers for default target titles.
 */

/** Types that mean the pin sits on a named address or place (not just a locality). */
const SPECIFIC_PLACE_TYPES = new Set([
  'street_address',
  'premise',
  'subpremise',
  'point_of_interest',
  'establishment',
  'airport',
  'park',
  'tourist_attraction',
  'natural_feature',
  'church',
  'school',
  'university',
  'hospital',
  'museum',
  'stadium',
  'zoo',
  'aquarium',
  'library',
  'shopping_mall',
  'store',
]);

const REGION_COMPONENT_TYPES = [
  'neighborhood',
  'sublocality',
  'sublocality_level_1',
  'locality',
  'postal_town',
  'administrative_area_level_3',
  'administrative_area_level_2',
  'administrative_area_level_1',
];

/**
 * @param {{ long_name?: string, short_name?: string, types?: string[] }[]} [components]
 * @param {string} [formattedAddress]
 * @returns {string}
 */
export function regionLabelFromGeocode(components = [], formattedAddress = '') {
  for (const type of REGION_COMPONENT_TYPES) {
    const match = components.find((c) => (c.types || []).includes(type));
    const name = match?.long_name || match?.short_name;
    if (name && name.trim()) return name.trim();
  }

  const fromFormatted = formattedAddress.split(',')[0]?.trim();
  if (fromFormatted) return fromFormatted;
  return 'Region';
}

/**
 * @param {{ types?: string[], formatted_address?: string, address_components?: { long_name?: string, short_name?: string, types?: string[] }[] } | null | undefined} result
 * @returns {string | null} specific place/address name, or null to fall back to region Target N
 */
export function specificPlaceName(result) {
  if (!result) return null;
  const types = result.types || [];
  if (!types.some((t) => SPECIFIC_PLACE_TYPES.has(t))) {
    return null;
  }

  const components = result.address_components || [];
  const premise = components.find((c) =>
    (c.types || []).some((t) => t === 'premise' || t === 'point_of_interest' || t === 'establishment')
  );
  if (premise?.long_name) return premise.long_name.trim();

  const streetNumber = components.find((c) => (c.types || []).includes('street_number'))?.long_name;
  const route = components.find((c) => (c.types || []).includes('route'))?.long_name;
  if (streetNumber && route) return `${streetNumber} ${route}`.trim();
  if (route) return route.trim();

  const formatted = result.formatted_address?.trim();
  if (formatted) return formatted.split(',')[0].trim();
  return null;
}

/**
 * @param {string} regionLabel
 * @param {number} index1Based
 * @returns {string}
 */
export function defaultTargetName(regionLabel, index1Based) {
  const region = (regionLabel || 'Region').trim() || 'Region';
  return `${region} Target ${index1Based}`;
}

/**
 * Pick a display name for one target: specific place if present, else Region Target N.
 * @param {{ regionLabel: string, index1Based: number, placeName?: string | null }} opts
 */
export function resolveTargetName({ regionLabel, index1Based, placeName }) {
  const place = typeof placeName === 'string' ? placeName.trim() : '';
  if (place) return place;
  return defaultTargetName(regionLabel, index1Based);
}
