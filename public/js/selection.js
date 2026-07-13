import { METERS_PER_MILE } from './constants.js';
import { confirmAction } from './confirm.js';
import { boundsForRadius, parseCoordinate, validateLatLng } from './geo.js';
import { setFieldError } from './ui.js';

/**
 * @typedef {{ lat: number, lng: number }} LatLng
 * @typedef {'address' | 'click' | 'latlng' | 'default'} CenterSource
 * @typedef {{
 *   mapsApiKey: string,
 *   defaults: {
 *     radiusMiles: number,
 *     dotCount: number,
 *     requiredSelections: number,
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

/**
 * Selection-tab map: center pin, radius circle, location forms.
 * P2 will hang dots/selection off this state and set willLoseWork.
 */
export function createSelectionController() {
  /** @type {google.maps.Map | null} */
  let map = null;
  /** @type {google.maps.Marker | null} */
  let centerMarker = null;
  /** @type {google.maps.Circle | null} */
  let radiusCircle = null;
  /** @type {LatLng | null} */
  let currentCenter = null;
  /** @type {CenterSource} */
  let currentSource = 'default';
  /** @type {number} */
  let currentRadiusMiles = 3;
  /** @type {AppConfig | null} */
  let config = null;
  /** @type {() => boolean} */
  let willLoseWork = () => false;

  function updateMeta() {
    const centerEl = document.getElementById('select-center-label');
    const sourceEl = document.getElementById('select-source-label');
    const radiusEl = document.getElementById('select-radius-label');
    const typeEl = document.getElementById('select-map-type');

    if (centerEl && currentCenter) {
      centerEl.textContent = `${currentCenter.lat.toFixed(4)}, ${currentCenter.lng.toFixed(4)}`;
    }
    if (sourceEl) sourceEl.textContent = currentSource;
    if (radiusEl) {
      const unit = config?.defaults.radiusUnit === 'km' ? 'km' : 'mi';
      radiusEl.textContent = `${currentRadiusMiles} ${unit}`;
    }
    if (typeEl && config) typeEl.textContent = config.defaults.mapType;

    const latInput = /** @type {HTMLInputElement | null} */ (
      document.getElementById('input-lat')
    );
    const lngInput = /** @type {HTMLInputElement | null} */ (
      document.getElementById('input-lng')
    );
    if (latInput && currentCenter && document.activeElement !== latInput) {
      latInput.value = String(currentCenter.lat);
    }
    if (lngInput && currentCenter && document.activeElement !== lngInput) {
      lngInput.value = String(currentCenter.lng);
    }
  }

  /**
   * @param {string} reason
   * @returns {Promise<boolean>}
   */
  async function confirmDestructiveChange(reason) {
    if (!config?.defaults.confirmOnRecenter) return true;
    if (!willLoseWork()) return true;

    return confirmAction(
      `${reason} This clears the current selection and regenerates candidate dots.`,
      {
        title: 'Reset map area?',
        confirmLabel: 'Reset',
        cancelLabel: 'Keep current',
      }
    );
  }

  /**
   * @param {LatLng} center
   * @param {CenterSource} source
   * @param {{ fit?: boolean, skipConfirm?: boolean }} [opts]
   * @returns {Promise<boolean>} whether the center was applied
   */
  async function setCenter(center, source, opts = {}) {
    if (!map) return false;

    const { fit = true, skipConfirm = false } = opts;
    const samePoint =
      currentCenter &&
      Math.abs(currentCenter.lat - center.lat) < 1e-9 &&
      Math.abs(currentCenter.lng - center.lng) < 1e-9 &&
      currentSource === source;

    if (!skipConfirm && !samePoint) {
      const ok = await confirmDestructiveChange(
        'Changing the center will redraw the area of interest.'
      );
      if (!ok) return false;
    }

    currentCenter = { lat: center.lat, lng: center.lng };
    currentSource = source;

    const radiusMeters = currentRadiusMiles * METERS_PER_MILE;

    if (!centerMarker) {
      centerMarker = new google.maps.Marker({
        map,
        position: currentCenter,
        title: 'Center',
        zIndex: 2,
      });
    } else {
      centerMarker.setPosition(currentCenter);
    }

    if (!radiusCircle) {
      radiusCircle = new google.maps.Circle({
        map,
        center: currentCenter,
        radius: radiusMeters,
        strokeColor: '#c4a35a',
        strokeOpacity: 0.95,
        strokeWeight: 2,
        fillColor: '#c4a35a',
        fillOpacity: 0.12,
        clickable: false,
        zIndex: 1,
      });
    } else {
      radiusCircle.setCenter(currentCenter);
      radiusCircle.setRadius(radiusMeters);
    }

    if (fit) {
      map.fitBounds(boundsForRadius(currentCenter, radiusMeters));
    }

    updateMeta();
    return true;
  }

  function refit() {
    if (!map || !currentCenter) return;
    map.fitBounds(
      boundsForRadius(currentCenter, currentRadiusMiles * METERS_PER_MILE)
    );
  }

  /**
   * @param {google.maps.Map} mapInstance
   * @param {AppConfig} runtimeConfig
   */
  function attachMap(mapInstance, runtimeConfig) {
    map = mapInstance;
    config = runtimeConfig;

    map.addListener('click', (event) => {
      if (!event.latLng) return;
      setFieldError('address-error', '');
      setFieldError('latlng-error', '');
      void setCenter(
        { lat: event.latLng.lat(), lng: event.latLng.lng() },
        'click'
      );
    });

    void setCenter(
      currentCenter || runtimeConfig.defaults.center,
      currentSource,
      { skipConfirm: true }
    );
  }

  /**
   * @param {AppConfig} runtimeConfig
   */
  function fillDefaults(runtimeConfig) {
    config = runtimeConfig;
    currentCenter = { ...runtimeConfig.defaults.center };
    currentSource = 'default';
    currentRadiusMiles = runtimeConfig.defaults.radiusMiles;

    const radiusInput = /** @type {HTMLInputElement | null} */ (
      document.getElementById('input-radius')
    );
    if (radiusInput) radiusInput.value = String(currentRadiusMiles);

    updateMeta();
  }

  function wireForms() {
    const addressForm = /** @type {HTMLFormElement | null} */ (
      document.getElementById('form-address')
    );
    const latlngForm = /** @type {HTMLFormElement | null} */ (
      document.getElementById('form-latlng')
    );
    const radiusInput = /** @type {HTMLInputElement | null} */ (
      document.getElementById('input-radius')
    );
    const geocodeBtn = /** @type {HTMLButtonElement | null} */ (
      document.getElementById('btn-geocode')
    );

    addressForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      setFieldError('address-error', '');
      setFieldError('latlng-error', '');

      const input = /** @type {HTMLInputElement | null} */ (
        document.getElementById('input-address')
      );
      const q = input?.value.trim() || '';
      if (!q) {
        setFieldError('address-error', 'Enter a street address.');
        return;
      }

      if (geocodeBtn) geocodeBtn.disabled = true;

      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
        const body = await res.json().catch(() => ({}));

        if (!res.ok) {
          setFieldError(
            'address-error',
            body.error || "Couldn't find that address"
          );
          return;
        }

        await setCenter({ lat: body.lat, lng: body.lng }, 'address');
      } catch (err) {
        console.error(err);
        setFieldError(
          'address-error',
          'Geocoding request failed. Try again, or use map click / lat-long.'
        );
      } finally {
        if (geocodeBtn) geocodeBtn.disabled = false;
      }
    });

    latlngForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      setFieldError('latlng-error', '');
      setFieldError('address-error', '');

      const latInput = /** @type {HTMLInputElement | null} */ (
        document.getElementById('input-lat')
      );
      const lngInput = /** @type {HTMLInputElement | null} */ (
        document.getElementById('input-lng')
      );

      const lat = parseCoordinate(latInput?.value || '');
      const lng = parseCoordinate(lngInput?.value || '');
      const rangeError =
        lat === null || lng === null
          ? 'Enter numeric latitude and longitude.'
          : validateLatLng(lat, lng);

      if (rangeError) {
        setFieldError('latlng-error', rangeError);
        return;
      }

      const applied = await setCenter(
        { lat: /** @type {number} */ (lat), lng: /** @type {number} */ (lng) },
        'latlng'
      );
      if (!applied) {
        // Restore inputs to the kept center.
        updateMeta();
      }
    });

    radiusInput?.addEventListener('change', async () => {
      setFieldError('radius-error', '');
      const value = Number(radiusInput.value);
      if (!Number.isFinite(value) || value <= 0) {
        setFieldError('radius-error', 'Radius must be a number greater than 0.');
        radiusInput.value = String(currentRadiusMiles);
        return;
      }

      if (value === currentRadiusMiles) return;

      const ok = await confirmDestructiveChange(
        'Changing the radius will redraw the area of interest.'
      );
      if (!ok) {
        radiusInput.value = String(currentRadiusMiles);
        return;
      }

      currentRadiusMiles = value;
      if (currentCenter) {
        await setCenter(currentCenter, currentSource, { skipConfirm: true });
      } else {
        updateMeta();
      }
    });
  }

  return {
    fillDefaults,
    wireForms,
    attachMap,
    refit,
    /** @param {() => boolean} fn P2: return true when selection/list would be lost */
    setWillLoseWork(fn) {
      willLoseWork = fn;
    },
    getCenter: () => currentCenter,
    getRadiusMiles: () => currentRadiusMiles,
    getSource: () => currentSource,
  };
}
