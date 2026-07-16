import { chooseAction, confirmAction } from './confirm.js';
import { byId, byIdAs } from './dom.js';
import { downloadJson, buildTargetsFilename } from './download.js';
import { generateCandidateDots } from './dots.js';
import { iconForDot } from './dot-markers.js';
import { createRadiusOverlay } from './map-radius-overlay.js';
import {
  regionLabelFromGeocode,
  specificPlaceName,
} from './place-names.js';
import { fetchReverseGeocode } from './reverse-geocode.js';
import { buildTargetFile, rowsFromSelectedDots } from './schema.js';
import { wireSelectionForms } from './selection-forms.js';
import {
  addCustomCandidate,
  isValidSelection,
  labelForCenterSource,
  selectedCount,
  toggleDotSelection,
  willLoseSelection,
} from './selection-logic.js';
import { createTargetingController } from './targeting.js';
import { setFieldError, setStatusMessage } from './ui.js';

/**
 * @typedef {import('./app-types.js').LatLng} LatLng
 * @typedef {import('./app-types.js').AppConfig} AppConfig
 * @typedef {'address' | 'click' | 'latlng' | 'default'} CenterSource
 * @typedef {{ id: string, lat: number, lng: number, selected: boolean }} CandidateDot
 */

/**
 * Selection-tab map: center, radius, target selection, annotate + export.
 */
export function createSelectionController() {
  /** @type {google.maps.Map | null} */
  let map = null;
  /** @type {ReturnType<typeof createRadiusOverlay> | null} */
  let overlay = null;
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
  /** @type {string | null} */
  let activeAnnotateCandidateId = null;
  /** @type {string} */
  let regionLabel = 'Region';
  /** True while Save Targets is reverse-geocoding; freezes selection edits. */
  let resolvingPlaceNames = false;

  function selectionLimits() {
    return {
      min: config?.defaults.minSelections ?? 1,
      max: config?.defaults.maxSelections ?? 12,
      blockExtra: config?.defaults.blockExtraSelections !== false,
    };
  }

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
    const { min, max } = selectionLimits();
    const count = selectedCount(candidates);
    const valid = isValidSelection(candidates, min, max);

    const meterLabel = byId('selection-meter-label');
    if (meterLabel) {
      meterLabel.textContent =
        min === max ? `Selected (need ${max})` : `Selected (${min}–${max})`;
    }

    const counterEl = byId('selection-counter');
    if (counterEl) {
      counterEl.textContent = `${count} / ${max}`;
      counterEl.classList.toggle('is-ready', valid);
      counterEl.classList.toggle('is-over', count > max);
      counterEl.classList.toggle('is-under', count > 0 && count < min);
    }

    const statusEl = byId('candidates-status');
    if (statusEl) {
      if (candidates.length === 0) {
        statusEl.textContent =
          'No targets loaded. Set a center, then click Load targets.';
      } else if (valid) {
        statusEl.textContent = `${candidates.length} on map — shortlist ready (${count} selected). Click Save Targets.`;
      } else if (count === 0) {
        statusEl.textContent = `${candidates.length} on map. Select at least ${min} (max ${max}).`;
      } else if (count > max) {
        statusEl.textContent = `${candidates.length} on map. Deselect until ${min}–${max} (currently ${count}).`;
      } else {
        statusEl.textContent = `${candidates.length} on map. Select ${min}–${max} (currently ${count}).`;
      }
    }

    const saveBtn = byIdAs('btn-save-targets');
    if (saveBtn && !resolvingPlaceNames) {
      saveBtn.disabled = !valid;
      saveBtn.title = valid
        ? 'Open targeting list for selected targets'
        : candidates.length === 0
          ? 'Load and select targets first'
          : `Select between ${min} and ${max} targets`;
    }

    const loadBtn = byIdAs('btn-load-dots');
    if (loadBtn) {
      loadBtn.disabled = resolvingPlaceNames || !currentCenter || !config;
      loadBtn.textContent =
        candidates.length > 0 ? 'Reload targets' : 'Load targets';
      loadBtn.title = resolvingPlaceNames
        ? 'Wait for place names to finish resolving'
        : loadBtn.disabled
          ? 'Set a center first (address, map click, or lat/long)'
          : candidates.length > 0
            ? 'Generate a new set of candidate targets'
            : 'Generate candidate targets inside the radius';
    }

    targeting.syncWithSelection(candidates);
  }

  function clearCandidateMarkers() {
    for (const marker of markersById.values()) {
      marker.setMap(null);
    }
    markersById.clear();
    candidates = [];
    activeAnnotateCandidateId = null;
    targeting.clear();
    setStatusMessage('targeting-place-notice', '');
    updateSelectionUi();
  }

  /**
   * @param {CandidateDot} dot
   */
  function syncMarkerIcon(dot) {
    const marker = markersById.get(dot.id);
    if (!marker) return;
    const active = activeAnnotateCandidateId === dot.id;
    marker.setIcon(iconForDot(dot.selected, { active }));
    marker.setZIndex(active ? 6 : dot.selected ? 4 : 3);
  }

  /**
   * Highlight the annotate-list's focused target on the map.
   * @param {string | null} candidateId
   */
  function setActiveAnnotateCandidate(candidateId) {
    const prevId = activeAnnotateCandidateId;
    activeAnnotateCandidateId = candidateId;

    if (prevId && prevId !== candidateId) {
      const prev = candidates.find((dot) => dot.id === prevId);
      if (prev) syncMarkerIcon(prev);
    }

    if (!candidateId) return;

    const dot = candidates.find((d) => d.id === candidateId);
    if (!dot) return;
    syncMarkerIcon(dot);
    if (map) {
      map.panTo({ lat: dot.lat, lng: dot.lng });
    }
  }

  /**
   * @param {string} id
   */
  function onDotClick(id) {
    if (!config || resolvingPlaceNames) return;
    const { max, blockExtra } = selectionLimits();
    const result = toggleDotSelection(candidates, id, {
      maxSelections: max,
      blockExtraSelections: blockExtra,
    });
    if (result.blocked) {
      setFieldError(
        'candidates-error',
        `Maximum ${max} targets. Deselect one first.`
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

  /**
   * @param {CandidateDot} dot
   */
  function placeOneCandidateMarker(dot) {
    if (!map) return;
    const active = activeAnnotateCandidateId === dot.id;
    const marker = new google.maps.Marker({
      map,
      position: { lat: dot.lat, lng: dot.lng },
      title: dot.id,
      icon: iconForDot(dot.selected, { active }),
      zIndex: active ? 6 : dot.selected ? 4 : 3,
      optimized: false,
    });
    marker.addListener('click', () => onDotClick(dot.id));
    markersById.set(dot.id, marker);
  }

  function placeCandidateMarkers() {
    if (!map) return;
    for (const marker of markersById.values()) {
      marker.setMap(null);
    }
    markersById.clear();

    for (const dot of candidates) {
      placeOneCandidateMarker(dot);
    }
  }

  /**
   * @param {import('./app-types.js').LatLng} point
   */
  function addCustomDotAt(point) {
    if (!config || resolvingPlaceNames) return;
    const { max, blockExtra } = selectionLimits();
    const result = addCustomCandidate(candidates, point, {
      maxSelections: max,
      blockExtraSelections: blockExtra,
    });
    candidates = result.dots;
    setFieldError('candidates-error', '');
    placeOneCandidateMarker(result.added);
    updateSelectionUi();
  }

  /**
   * Map click while candidates are loaded: custom target, recenter, or keep.
   * @param {import('./app-types.js').LatLng} point
   * @returns {Promise<void>}
   */
  async function onBlankMapClick(point) {
    if (resolvingPlaceNames) return;

    const choice = await chooseAction(
      'Click was outside existing targets. Add a custom target here, recenter the area of interest, or leave the map unchanged.',
      {
        title: 'Map click',
        primaryLabel: 'Add custom target',
        secondaryLabel: 'Recenter',
        cancelLabel: 'Keep current',
      }
    );

    if (resolvingPlaceNames) return;
    if (choice === 'primary') {
      addCustomDotAt(point);
      return;
    }
    if (choice === 'secondary') {
      void setCenter(point, 'click', { skipConfirm: true });
    }
  }

  /**
   * @param {string} reason
   * @returns {Promise<boolean>}
   */
  async function confirmDestructiveChange(reason) {
    if (resolvingPlaceNames) return false;
    if (!config?.defaults.confirmOnRecenter) return true;
    if (!willLoseWork()) return true;

    return confirmAction(
      `${reason} This clears the current selection and removes candidate targets.`,
      {
        title: 'Reset map area?',
        confirmLabel: 'Reset',
        cancelLabel: 'Keep current',
      }
    );
  }

  /**
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
   * @returns {Promise<{ label: string, ok: boolean }>}
   */
  async function resolveRegionLabel(center) {
    const result = await fetchReverseGeocode(center.lat, center.lng);
    if (!result.ok) {
      return { label: regionLabel || 'Region', ok: false };
    }
    return {
      label: regionLabelFromGeocode(
        result.addressComponents,
        result.formattedAddress
      ),
      ok: true,
    };
  }

  /**
   * @param {CandidateDot} dot
   * @returns {Promise<{ name: string | null, ok: boolean }>}
   */
  async function resolvePlaceNameForDot(dot) {
    const result = await fetchReverseGeocode(dot.lat, dot.lng);
    if (!result.ok) return { name: null, ok: false };

    for (const entry of result.results) {
      const name = specificPlaceName(entry);
      if (name) return { name, ok: true };
    }
    return {
      name: specificPlaceName({
        types: result.types,
        formatted_address: result.formattedAddress,
        address_components: result.addressComponents,
      }),
      ok: true,
    };
  }

  /**
   * @param {LatLng} center
   * @param {CenterSource} source
   * @param {{ fit?: boolean, skipConfirm?: boolean, clearCandidates?: boolean, regionLabel?: string }} [opts]
   * @returns {Promise<boolean>}
   */
  async function setCenter(center, source, opts = {}) {
    if (!map || !overlay || resolvingPlaceNames) return false;

    const {
      fit = true,
      skipConfirm = false,
      clearCandidates = true,
      regionLabel: nextRegion,
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
    if (typeof nextRegion === 'string' && nextRegion.trim()) {
      regionLabel = nextRegion.trim();
    } else if (!samePoint) {
      const resolved = await resolveRegionLabel(currentCenter);
      regionLabel = resolved.label;
    }

    overlay.setArea(currentCenter, currentRadiusMiles, { fit });
    updateMeta();

    if (clearCandidates && !samePoint) {
      clearCandidateMarkers();
    } else {
      updateSelectionUi();
    }

    return true;
  }

  function refit() {
    overlay?.refit();
  }

  /**
   * @param {google.maps.Map} mapInstance
   * @param {AppConfig} runtimeConfig
   */
  function attachMap(mapInstance, runtimeConfig) {
    map = mapInstance;
    config = runtimeConfig;
    overlay = createRadiusOverlay(map);

    map.addListener('click', (event) => {
      if (!event.latLng) return;
      setFieldError('address-error', '');
      setFieldError('latlng-error', '');
      const point = {
        lat: event.latLng.lat(),
        lng: event.latLng.lng(),
      };
      if (candidates.length > 0) {
        void onBlankMapClick(point);
        return;
      }
      void setCenter(point, 'click');
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
    regionLabel = 'Region';

    const radiusInput = byIdAs('input-radius');
    if (radiusInput) radiusInput.value = String(currentRadiusMiles);

    const counterEl = byId('selection-counter');
    if (counterEl) {
      counterEl.textContent = `0 / ${runtimeConfig.defaults.maxSelections}`;
    }

    updateMeta();
    updateSelectionUi();
  }

  /**
   * @returns {Promise<boolean>}
   */
  async function loadDots() {
    if (!map || !currentCenter || !config || resolvingPlaceNames) return false;

    if (willLoseWork() && config.defaults.confirmOnRecenter) {
      const ok = await confirmAction(
        'Loading new targets clears your current selection.',
        {
          title: 'Reload targets?',
          confirmLabel: 'Reload',
          cancelLabel: 'Keep current',
        }
      );
      if (!ok) return false;
    }

    setFieldError('candidates-error', '');
    setStatusMessage('targeting-place-notice', '');
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
    if (!radiusInput || resolvingPlaceNames) return false;

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

  async function saveTargets() {
    if (!config || !currentCenter || resolvingPlaceNames) return;
    const { min, max } = selectionLimits();
    if (!isValidSelection(candidates, min, max)) {
      setFieldError(
        'candidates-error',
        `Select between ${min} and ${max} targets before saving.`
      );
      return;
    }

    // Snapshot before awaits so concurrent map edits cannot change the shortlist.
    const selectedSnapshot = candidates
      .filter((dot) => dot.selected)
      .map((dot) => ({ ...dot }));

    setFieldError('candidates-error', '');
    setStatusMessage('targeting-place-notice', '');
    resolvingPlaceNames = true;
    const saveBtn = byIdAs('btn-save-targets');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.setAttribute('aria-busy', 'true');
      saveBtn.textContent = 'Resolving names…';
    }
    updateSelectionUi();

    let placeLookupFailed = false;

    try {
      if (!regionLabel || regionLabel === 'Region') {
        const resolved = await resolveRegionLabel(currentCenter);
        regionLabel = resolved.label;
        if (!resolved.ok) placeLookupFailed = true;
      }

      /** @type {Record<string, string | null>} */
      const placeNamesByCandidateId = {};
      await Promise.all(
        selectedSnapshot.map(async (dot) => {
          const resolved = await resolvePlaceNameForDot(dot);
          placeNamesByCandidateId[dot.id] = resolved.name;
          if (!resolved.ok) placeLookupFailed = true;
        })
      );

      targeting.openWithRows(
        rowsFromSelectedDots(selectedSnapshot, {
          regionLabel,
          placeNamesByCandidateId,
        })
      );

      if (placeLookupFailed) {
        setStatusMessage(
          'targeting-place-notice',
          "Couldn't resolve place names; using defaults. You can edit names before download."
        );
      }
    } finally {
      resolvingPlaceNames = false;
      if (saveBtn) {
        saveBtn.textContent = 'Save Targets';
        saveBtn.removeAttribute('aria-busy');
      }
      updateSelectionUi();
    }
  }

  function downloadTargets() {
    if (!config || !currentCenter) return;
    const { min, max } = selectionLimits();

    const collected = targeting.collectValidated({
      minSelections: min,
      maxSelections: max,
    });
    if (!collected.ok) {
      setFieldError('targeting-error', collected.message);
      return;
    }

    const built = buildTargetFile({
      center: currentCenter,
      source: currentSource,
      radiusMiles: currentRadiusMiles,
      dotCount: config.defaults.dotCount,
      minSelections: min,
      maxSelections: max,
      seed: null,
      title: collected.title,
      category: collected.category,
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

  async function saveTargetsToServer() {
    if (!config || !currentCenter) return;
    const { min, max } = selectionLimits();

    const collected = targeting.collectValidated({
      minSelections: min,
      maxSelections: max,
    });
    if (!collected.ok) {
      setFieldError('targeting-error', collected.message);
      return;
    }

    const built = buildTargetFile({
      center: currentCenter,
      source: currentSource,
      radiusMiles: currentRadiusMiles,
      dotCount: config.defaults.dotCount,
      minSelections: min,
      maxSelections: max,
      seed: null,
      title: collected.title,
      category: collected.category,
      rows: collected.rows,
    });

    if (!built.ok) {
      setFieldError('targeting-error', built.message);
      return;
    }

    const saveBtn = byIdAs('btn-save-server');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.setAttribute('aria-busy', 'true');
      saveBtn.textContent = 'Saving…';
    }
    setFieldError('targeting-error', '');
    targeting.clearSuccess();

    try {
      const res = await fetch('/api/targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(built.document),
      });
      /** @type {Record<string, unknown>} */
      let body = {};
      try {
        body = await res.json();
      } catch {
        body = {};
      }
      if (!res.ok) {
        setFieldError(
          'targeting-error',
          typeof body.error === 'string'
            ? body.error
            : 'Could not save to the server.'
        );
        return;
      }
      const title =
        typeof body.title === 'string' ? body.title : collected.title;
      targeting.setSuccess(`Saved “${title}” to the server.`);
    } catch (err) {
      console.error(err);
      setFieldError(
        'targeting-error',
        'Could not reach the server. Try Download JSON or retry.'
      );
    } finally {
      if (saveBtn) {
        saveBtn.textContent = 'Save to server';
        saveBtn.removeAttribute('aria-busy');
      }
      // Re-enable based on form readiness (saveBtn was force-disabled).
      const recheck = targeting.collectValidated({
        minSelections: min,
        maxSelections: max,
      });
      if (saveBtn) saveBtn.disabled = !recheck.ok;
      const downloadBtn = byIdAs('btn-download-json');
      if (downloadBtn) downloadBtn.disabled = !recheck.ok;
    }
  }

  function wireForms() {
    targeting.setOnActiveCandidateChange(setActiveAnnotateCandidate);
    wireSelectionForms({
      setCenter,
      applyRadiusFromInput,
      loadDots,
      saveTargets,
      downloadTargets,
      saveTargetsToServer,
      updateMeta,
      updateSelectionUi,
    });
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
    getRegionLabel: () => regionLabel,
  };
}
