import { METERS_PER_MILE } from './constants.js';
import { confirmAction } from './confirm.js';
import { byId, byIdAs } from './dom.js';
import { downloadJson, buildTargetsFilename } from './download.js';
import { generateCandidateDots } from './dots.js';
import { iconForDot } from './dot-markers.js';
import { boundsForRadius, parseCoordinate, validateLatLng } from './geo.js';
import { buildTargetFile, rowsFromSelectedDots } from './schema.js';
import {
  isExactSelection,
  labelForCenterSource,
  selectedCount,
  toggleDotSelection,
  willLoseSelection,
} from './selection-logic.js';
import { createTargetingController } from './targeting.js';
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
 * Selection-tab map: center pin, radius circle, location forms, candidates, export (P3).
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
  const targeting = createTargetingController();

  function willLoseWork() {
    return willLoseSelection(candidates);
  }

  function updateMeta() {
    const centerEl = byId('select-center-label');
    const sourceEl = byId('select-source-label');
    const radiusEl = byId('select-radius-label');
    const typeEl = byId('select-map-type');

    if (centerEl && currentCenter) {
      centerEl.textContent = `${currentCenter.lat.toFixed(4)}, ${currentCenter.lng.toFixed(4)}`;
    }
    if (sourceEl) sourceEl.textContent = labelForCenterSource(currentSource);
    if (radiusEl) {
      const unit = config?.defaults.radiusUnit === 'km' ? 'km' : 'mi';
      radiusEl.textContent = `${currentRadiusMiles} ${unit}`;
    }
    if (typeEl && config) typeEl.textContent = config.defaults.mapType;

    const latInput = byIdAs('input-lat');
    const lngInput = byIdAs('input-lng');
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

    const counterEl = byId('selection-counter');
    if (counterEl) {
      counterEl.textContent = `${count} / ${required}`;
      counterEl.classList.toggle('is-exact', exact);
      counterEl.classList.toggle('is-over', count > required);
      counterEl.classList.toggle('is-under', count > 0 && count < required);
    }

    const statusEl = byId('candidates-status');
    if (statusEl) {
      if (candidates.length === 0) {
        statusEl.textContent = 'No candidates loaded.';
      } else if (exact) {
        statusEl.textContent = `${candidates.length} candidates — shortlist ready. Click Save Targets.`;
      } else {
        statusEl.textContent = `${candidates.length} candidates on map. Select ${required}.`;
      }
    }

    const saveBtn = byIdAs('btn-save-targets');
    if (saveBtn) saveBtn.disabled = !exact;

    const loadBtn = byIdAs('btn-load-dots');
    if (loadBtn) {
      loadBtn.disabled = !currentCenter || !config;
      loadBtn.textContent =
        candidates.length > 0 ? 'Reload dots' : 'Load dots';
    }

    targeting.syncWithSelection(candidates, required);
  }

  function clearCandidateMarkers() {
    for (const marker of markersById.values()) {
      marker.setMap(null);
    }
    markersById.clear();
    candidates = [];
    targeting.clear();
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
   * Same lat/lng does not clear candidates (source label may still update).
   * @param {LatLng} center
   * @param {LatLng | null} previous
   */
  function sameCoordinates(center, previous) {
    return Boolean(
      previous &&
        Math.abs(previous.lat - center.lat) < 1e-9 &&
        Math.abs(previous.lng - center.lng) < 1e-9
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
    const samePoint = sameCoordinates(center, currentCenter);

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
    } else {
      updateMeta();
      updateSelectionUi();
    }

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

    const radiusInput = byIdAs('input-radius');
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
    targeting.clear();
    candidates = generateCandidateDots({
      center: currentCenter,
      radiusMiles: currentRadiusMiles,
      count: config.defaults.dotCount,
      minSpacingMeters: config.defaults.minDotSpacingMeters,
    });
    placeCandidateMarkers();
    updateSelectionUi();

    byId('candidates-heading')?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    });
    return true;
  }

  /**
   * @returns {Promise<boolean>}
   */
  async function applyRadiusFromInput() {
    const radiusInput = byIdAs('input-radius');
    if (!radiusInput) return false;

    setFieldError('radius-error', '');
    const value = Number(radiusInput.value);
    if (!Number.isFinite(value) || value <= 0) {
      setFieldError('radius-error', 'Radius must be a number greater than 0.');
      radiusInput.value = String(currentRadiusMiles);
      radiusInput.focus();
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

  function saveTargets() {
    if (!config || !currentCenter) return;
    const required = config.defaults.requiredSelections;
    if (!isExactSelection(candidates, required)) {
      setFieldError(
        'candidates-error',
        `Select exactly ${required} candidates before saving.`
      );
      return;
    }

    setFieldError('candidates-error', '');
    targeting.openWithRows(rowsFromSelectedDots(candidates));
  }

  function downloadTargets() {
    if (!config || !currentCenter) return;

    const collected = targeting.collectValidated(
      config.defaults.requiredSelections
    );
    if (!collected.ok) {
      setFieldError('targeting-error', collected.message);
      return;
    }

    const built = buildTargetFile({
      center: currentCenter,
      source: currentSource,
      radiusMiles: currentRadiusMiles,
      dotCount: config.defaults.dotCount,
      requiredSelections: config.defaults.requiredSelections,
      seed: null,
      rows: collected.rows,
    });

    if (!built.ok) {
      setFieldError('targeting-error', built.message);
      return;
    }

    const filename = buildTargetsFilename();
    downloadJson(filename, built.document);
    setFieldError('targeting-error', '');
    targeting.setSuccess(`Downloaded ${filename}`);
  }

  function wireForms() {
    const addressForm = byIdAs('form-address');
    const latlngForm = byIdAs('form-latlng');
    const radiusForm = byIdAs('form-radius');
    const geocodeBtn = byIdAs('btn-geocode');
    const loadDotsBtn = byIdAs('btn-load-dots');
    const saveBtn = byIdAs('btn-save-targets');
    const downloadBtn = byIdAs('btn-download-json');

    addressForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      setFieldError('address-error', '');
      setFieldError('latlng-error', '');

      const input = byIdAs('input-address');
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

      const latInput = byIdAs('input-lat');
      const lngInput = byIdAs('input-lng');

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
      saveTargets();
    });

    downloadBtn?.addEventListener('click', () => {
      if (downloadBtn.disabled) return;
      downloadTargets();
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
