import { METERS_PER_MILE } from './constants.js';
import { confirmAction } from './confirm.js';
import { generateCandidateDots } from './dots.js';
import { iconForDot } from './dot-markers.js';
import { boundsForRadius, parseCoordinate, validateLatLng } from './geo.js';
import {
  isExactSelection,
  labelForCenterSource,
  selectedCount,
  toggleDotSelection,
  willLoseSelection,
} from './selection-logic.js';
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
 * @typedef {{ id: string, lat: number, lng: number, selected: boolean }} CandidateDot
 */

/**
 * Selection-tab map: center pin, radius circle, location forms, candidate dots (P2).
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
  /** @type {CandidateDot[]} */
  let candidates = [];
  /** @type {Map<string, google.maps.Marker>} */
  const markersById = new Map();

  function willLoseWork() {
    return willLoseSelection(candidates);
  }

  function updateMeta() {
    const centerEl = document.getElementById('select-center-label');
    const sourceEl = document.getElementById('select-source-label');
    const radiusEl = document.getElementById('select-radius-label');
    const typeEl = document.getElementById('select-map-type');

    if (centerEl && currentCenter) {
      centerEl.textContent = `${currentCenter.lat.toFixed(4)}, ${currentCenter.lng.toFixed(4)}`;
    }
    if (sourceEl) sourceEl.textContent = labelForCenterSource(currentSource);
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

  function updateSelectionUi() {
    const required = config?.defaults.requiredSelections ?? 12;
    const count = selectedCount(candidates);
    const exact = isExactSelection(candidates, required);

    const counterEl = document.getElementById('selection-counter');
    if (counterEl) {
      counterEl.textContent = `${count} / ${required}`;
      counterEl.classList.toggle('is-exact', exact);
      counterEl.classList.toggle('is-over', count > required);
      counterEl.classList.toggle('is-under', count > 0 && count < required);
    }

    const statusEl = document.getElementById('candidates-status');
    if (statusEl) {
      if (candidates.length === 0) {
        statusEl.textContent = 'No candidates loaded.';
      } else {
        statusEl.textContent = `${candidates.length} candidates on map.`;
      }
    }

    const saveBtn = /** @type {HTMLButtonElement | null} */ (
      document.getElementById('btn-save-targets')
    );
    if (saveBtn) saveBtn.disabled = !exact;

    const loadBtn = /** @type {HTMLButtonElement | null} */ (
      document.getElementById('btn-load-dots')
    );
    if (loadBtn) {
      loadBtn.disabled = !currentCenter || !config;
      loadBtn.textContent =
        candidates.length > 0 ? 'Reload dots' : 'Load dots';
    }
  }

  function clearCandidateMarkers() {
    for (const marker of markersById.values()) {
      marker.setMap(null);
    }
    markersById.clear();
    candidates = [];
    updateSelectionUi();
  }

  /**
   * @param {CandidateDot} dot
   */
  function syncMarkerIcon(dot) {
    const marker = markersById.get(dot.id);
    if (!marker) return;
    marker.setIcon(iconForDot(dot.selected));
    marker.setZIndex(dot.selected ? 4 : 3);
  }

  /**
   * @param {string} id
   */
  function onDotClick(id) {
    if (!config) return;
    const result = toggleDotSelection(candidates, id, {
      requiredSelections: config.defaults.requiredSelections,
      blockExtraSelections: config.defaults.blockExtraSelections,
    });
    if (result.blocked) {
      setFieldError(
        'candidates-error',
        `Select exactly ${config.defaults.requiredSelections}. Deselect one first.`
      );
      return;
    }
    if (!result.changed) return;

    setFieldError('candidates-error', '');
    candidates = result.dots;
    const updated = candidates.find((dot) => dot.id === id);
    if (updated) syncMarkerIcon(updated);
    updateSelectionUi();
  }

  function placeCandidateMarkers() {
    if (!map) return;
    for (const marker of markersById.values()) {
      marker.setMap(null);
    }
    markersById.clear();

    for (const dot of candidates) {
      const marker = new google.maps.Marker({
        map,
        position: { lat: dot.lat, lng: dot.lng },
        title: dot.id,
        icon: iconForDot(dot.selected),
        zIndex: dot.selected ? 4 : 3,
        optimized: false,
      });
      marker.addListener('click', () => onDotClick(dot.id));
      markersById.set(dot.id, marker);
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
      `${reason} This clears the current selection and removes candidate dots.`,
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
   * @param {{ fit?: boolean, skipConfirm?: boolean, clearCandidates?: boolean }} [opts]
   * @returns {Promise<boolean>} whether the center was applied
   */
  async function setCenter(center, source, opts = {}) {
    if (!map) return false;

    const {
      fit = true,
      skipConfirm = false,
      clearCandidates = true,
    } = opts;
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

    if (clearCandidates && !samePoint) {
      clearCandidateMarkers();
    }

    updateMeta();
    updateSelectionUi();
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
      { skipConfirm: true, clearCandidates: false }
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
    updateSelectionUi();
  }

  /**
   * @returns {Promise<boolean>}
   */
  async function loadDots() {
    if (!map || !currentCenter || !config) return false;

    if (willLoseWork() && config.defaults.confirmOnRecenter) {
      const ok = await confirmAction(
        'Loading new candidates clears your current selection.',
        {
          title: 'Reload candidates?',
          confirmLabel: 'Reload',
          cancelLabel: 'Keep current',
        }
      );
      if (!ok) return false;
    }

    setFieldError('candidates-error', '');
    candidates = generateCandidateDots({
      center: currentCenter,
      radiusMiles: currentRadiusMiles,
      count: config.defaults.dotCount,
      minSpacingMeters: config.defaults.minDotSpacingMeters,
    });
    placeCandidateMarkers();
    updateSelectionUi();
    return true;
  }

  /**
   * @returns {Promise<boolean>}
   */
  async function applyRadiusFromInput() {
    const radiusInput = /** @type {HTMLInputElement | null} */ (
      document.getElementById('input-radius')
    );
    if (!radiusInput) return false;

    setFieldError('radius-error', '');
    const value = Number(radiusInput.value);
    if (!Number.isFinite(value) || value <= 0) {
      setFieldError('radius-error', 'Radius must be a number greater than 0.');
      radiusInput.value = String(currentRadiusMiles);
      return false;
    }

    if (value === currentRadiusMiles) {
      if (currentCenter) refit();
      return true;
    }

    const ok = await confirmDestructiveChange(
      'Changing the radius will redraw the area of interest.'
    );
    if (!ok) {
      radiusInput.value = String(currentRadiusMiles);
      return false;
    }

    currentRadiusMiles = value;
    clearCandidateMarkers();
    if (currentCenter) {
      await setCenter(currentCenter, currentSource, {
        skipConfirm: true,
        clearCandidates: false,
      });
    } else {
      updateMeta();
      updateSelectionUi();
    }
    return true;
  }

  function wireForms() {
    const addressForm = /** @type {HTMLFormElement | null} */ (
      document.getElementById('form-address')
    );
    const latlngForm = /** @type {HTMLFormElement | null} */ (
      document.getElementById('form-latlng')
    );
    const radiusForm = /** @type {HTMLFormElement | null} */ (
      document.getElementById('form-radius')
    );
    const geocodeBtn = /** @type {HTMLButtonElement | null} */ (
      document.getElementById('btn-geocode')
    );
    const loadDotsBtn = /** @type {HTMLButtonElement | null} */ (
      document.getElementById('btn-load-dots')
    );
    const saveBtn = /** @type {HTMLButtonElement | null} */ (
      document.getElementById('btn-save-targets')
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
        updateMeta();
      }
    });

    radiusForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      void applyRadiusFromInput();
    });

    loadDotsBtn?.addEventListener('click', () => {
      void loadDots();
    });

    saveBtn?.addEventListener('click', () => {
      if (saveBtn.disabled) return;
      setFieldError(
        'candidates-error',
        'Annotation and export arrive in Phase 3. Selection is ready.'
      );
    });

    updateSelectionUi();
  }

  return {
    fillDefaults,
    wireForms,
    attachMap,
    refit,
    loadDots,
    getCenter: () => currentCenter,
    getRadiusMiles: () => currentRadiusMiles,
    getSource: () => currentSource,
    getCandidates: () => candidates.slice(),
  };
}
