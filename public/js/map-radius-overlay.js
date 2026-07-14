import { METERS_PER_MILE } from './constants.js';
import { boundsForRadius } from './geo.js';

/**
 * @typedef {{ lat: number, lng: number }} LatLng
 */

const DEFAULT_CIRCLE = {
  strokeColor: '#c4a35a',
  strokeOpacity: 0.95,
  strokeWeight: 2,
  fillColor: '#c4a35a',
  fillOpacity: 0.12,
};

/**
 * Center pin + radius circle + fitBounds — shared by Selection and Review.
 *
 * @param {google.maps.Map} map
 * @param {Partial<typeof DEFAULT_CIRCLE>} [circleStyle]
 */
export function createRadiusOverlay(map, circleStyle = {}) {
  /** @type {google.maps.Marker | null} */
  let centerMarker = null;
  /** @type {google.maps.Circle | null} */
  let radiusCircle = null;
  /** @type {LatLng | null} */
  let center = null;
  /** @type {number} */
  let radiusMiles = 0;

  const style = { ...DEFAULT_CIRCLE, ...circleStyle };

  /**
   * @param {LatLng} nextCenter
   * @param {number} nextRadiusMiles
   * @param {{ fit?: boolean }} [opts]
   */
  function setArea(nextCenter, nextRadiusMiles, opts = {}) {
    const { fit = true } = opts;
    center = { lat: nextCenter.lat, lng: nextCenter.lng };
    radiusMiles = nextRadiusMiles;
    const radiusMeters = radiusMiles * METERS_PER_MILE;

    if (!centerMarker) {
      centerMarker = new google.maps.Marker({
        map,
        position: center,
        title: 'Center',
        zIndex: 2,
      });
    } else {
      centerMarker.setMap(map);
      centerMarker.setPosition(center);
    }

    if (!radiusCircle) {
      radiusCircle = new google.maps.Circle({
        map,
        center,
        radius: radiusMeters,
        strokeColor: style.strokeColor,
        strokeOpacity: style.strokeOpacity,
        strokeWeight: style.strokeWeight,
        fillColor: style.fillColor,
        fillOpacity: style.fillOpacity,
        clickable: false,
        zIndex: 1,
      });
    } else {
      radiusCircle.setMap(map);
      radiusCircle.setCenter(center);
      radiusCircle.setRadius(radiusMeters);
    }

    if (fit) {
      map.fitBounds(boundsForRadius(center, radiusMeters));
    }
  }

  function refit() {
    if (!center) return;
    map.fitBounds(boundsForRadius(center, radiusMiles * METERS_PER_MILE));
  }

  function clear() {
    if (centerMarker) {
      centerMarker.setMap(null);
      centerMarker = null;
    }
    if (radiusCircle) {
      radiusCircle.setMap(null);
      radiusCircle = null;
    }
    center = null;
    radiusMiles = 0;
  }

  return {
    setArea,
    refit,
    clear,
    /** @returns {LatLng | null} */
    getCenter: () => (center ? { ...center } : null),
    /** @returns {number} */
    getRadiusMiles: () => radiusMiles,
  };
}
