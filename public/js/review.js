/**
 * Review tab: upload §4 JSON, validate, re-render center/radius + saved targets.
 */

import { byId, byIdAs } from './dom.js';
import { iconForSavedTarget } from './dot-markers.js';
import { createRadiusOverlay } from './map-radius-overlay.js';
import {
  formatConfidenceLabel,
  formatPriorityLabel,
  formatReviewMeta,
  parseTargetFileJson,
  targetInfoLines,
} from './review-logic.js';
import { setFieldError } from './ui.js';

/**
 * @typedef {import('./app-types.js').AppConfig} AppConfig
 * @typedef {import('./schema.js').TargetFile} TargetFile
 * @typedef {TargetFile['targets'][number]} SavedTarget
 */

/**
 * @returns {{
 *   attachMap: (map: google.maps.Map, config: AppConfig) => void,
 *   wireUpload: () => void,
 *   refit: () => void,
 *   hasDocument: () => boolean,
 * }}
 */
export function createReviewController() {
  /** @type {google.maps.Map | null} */
  let map = null;
  /** @type {ReturnType<typeof createRadiusOverlay> | null} */
  let overlay = null;
  /** @type {google.maps.InfoWindow | null} */
  let infoWindow = null;
  /** @type {TargetFile | null} */
  let loadedFile = null;
  /** @type {string} */
  let loadedFilename = '';
  /** @type {Map<string, google.maps.Marker>} */
  const markersById = new Map();
  /** @type {string | null} */
  let activeTargetId = null;

  function els() {
    return {
      metaSection: byId('section-review-meta'),
      listSection: byId('section-review-targets'),
      list: byId('review-target-list'),
      status: byId('review-status'),
      fileInput: byIdAs('input-review-file'),
      filename: byId('review-filename-label'),
      createdAt: byId('review-created-label'),
      center: byId('review-center-label'),
      source: byId('review-source-label'),
      radius: byId('review-radius-label'),
      targetCount: byId('review-count-label'),
    };
  }

  /**
   * @param {SavedTarget} target
   * @returns {HTMLElement}
   */
  function buildInfoContent(target) {
    const root = document.createElement('div');
    root.className = 'review-info';

    const title = document.createElement('p');
    title.className = 'review-info-title';
    title.textContent = target.name;
    root.append(title);

    const conf = document.createElement('p');
    conf.className = 'review-info-line';
    conf.textContent = `Confidence: ${formatConfidenceLabel(target.confidence)}`;
    root.append(conf);

    const pri = document.createElement('p');
    pri.className = 'review-info-line';
    pri.textContent = `Priority: ${formatPriorityLabel(target.priority)}`;
    root.append(pri);

    return root;
  }

  /**
   * @param {string | null} targetId
   */
  function setActiveListRow(targetId) {
    activeTargetId = targetId;
    const { list } = els();
    if (!list) return;
    for (const row of list.querySelectorAll('.review-target-row')) {
      const id = row.getAttribute('data-target-id');
      row.classList.toggle('is-active', Boolean(targetId && id === targetId));
    }
  }

  /**
   * @param {SavedTarget} target
   */
  function focusTarget(target) {
    if (!map) return;
    const marker = markersById.get(target.id);
    if (!marker) return;

    if (!infoWindow) {
      infoWindow = new google.maps.InfoWindow();
    }

    infoWindow.setContent(buildInfoContent(target));
    infoWindow.open({ map, anchor: marker });
    map.panTo({ lat: target.lat, lng: target.lng });
    setActiveListRow(target.id);

    const { list } = els();
    if (list) {
      for (const row of list.querySelectorAll('.review-target-row')) {
        if (row.getAttribute('data-target-id') === target.id) {
          row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          break;
        }
      }
    }
  }

  function clearTargetMarkers() {
    for (const marker of markersById.values()) {
      marker.setMap(null);
    }
    markersById.clear();
    infoWindow?.close();
    setActiveListRow(null);
  }

  function updateMetaUi() {
    const nodes = els();
    if (!loadedFile) {
      if (nodes.metaSection) nodes.metaSection.hidden = true;
      if (nodes.listSection) nodes.listSection.hidden = true;
      if (nodes.status) {
        nodes.status.textContent = 'No file loaded.';
      }
      return;
    }

    const meta = formatReviewMeta(loadedFile, loadedFilename);
    if (nodes.filename) nodes.filename.textContent = meta.filename;
    if (nodes.createdAt) nodes.createdAt.textContent = meta.createdAt;
    if (nodes.center) nodes.center.textContent = meta.center;
    if (nodes.source) nodes.source.textContent = meta.source;
    if (nodes.radius) nodes.radius.textContent = meta.radius;
    if (nodes.targetCount) nodes.targetCount.textContent = meta.targetCount;
    if (nodes.metaSection) nodes.metaSection.hidden = false;
    if (nodes.listSection) nodes.listSection.hidden = false;
    if (nodes.status) {
      const n = loadedFile.targets.length;
      nodes.status.textContent = `Loaded ${n} target${n === 1 ? '' : 's'}.`;
    }
  }

  function renderTargetList() {
    const { list } = els();
    if (!list) return;
    list.replaceChildren();

    if (!loadedFile) return;

    for (const target of loadedFile.targets) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'review-target-row';
      button.dataset.targetId = target.id;

      const name = document.createElement('span');
      name.className = 'review-target-name';
      name.textContent = target.name;

      const meta = document.createElement('span');
      meta.className = 'review-target-meta';
      meta.textContent = `${formatConfidenceLabel(target.confidence)} · ${formatPriorityLabel(target.priority)}`;

      const coords = document.createElement('span');
      coords.className = 'review-target-coords';
      coords.textContent = `${target.lat.toFixed(4)}, ${target.lng.toFixed(4)}`;

      button.append(name, meta, coords);
      button.addEventListener('click', () => focusTarget(target));
      button.title = targetInfoLines(target).join(' · ');
      list.append(button);
    }

    if (activeTargetId) setActiveListRow(activeTargetId);
  }

  /**
   * @param {TargetFile} doc
   */
  function renderDocument(doc) {
    if (!map || !overlay) return;

    clearTargetMarkers();
    overlay.setArea(doc.center, doc.radiusMiles, { fit: true });

    for (const target of doc.targets) {
      const marker = new google.maps.Marker({
        map,
        position: { lat: target.lat, lng: target.lng },
        title: target.name,
        icon: iconForSavedTarget(),
        zIndex: 4,
        optimized: false,
      });
      marker.addListener('click', () => focusTarget(target));
      markersById.set(target.id, marker);
    }

    renderTargetList();
    updateMetaUi();
  }

  function clearLoadedDocument() {
    loadedFile = null;
    loadedFilename = '';
    clearTargetMarkers();
    overlay?.clear();
    renderTargetList();
    updateMetaUi();
  }

  /**
   * @param {string} text
   * @param {string} [filename]
   * @returns {boolean}
   */
  function loadFromText(text, filename = '') {
    const parsed = parseTargetFileJson(text);
    if (!parsed.ok) {
      setFieldError('review-error', parsed.message);
      clearLoadedDocument();
      return false;
    }

    setFieldError('review-error', '');
    loadedFile = parsed.document;
    loadedFilename = filename || 'targets.json';
    if (map && overlay) {
      renderDocument(loadedFile);
    } else {
      renderTargetList();
      updateMetaUi();
    }
    return true;
  }

  /**
   * @param {File} file
   * @returns {Promise<boolean>}
   */
  function loadFromFile(file) {
    return new Promise((resolve) => {
      setFieldError('review-error', '');
      const statusEl = byId('review-status');
      if (statusEl) statusEl.textContent = 'Reading file…';
      const reader = new FileReader();
      reader.onload = () => {
        const text = typeof reader.result === 'string' ? reader.result : '';
        resolve(loadFromText(text, file.name));
      };
      reader.onerror = () => {
        setFieldError('review-error', 'Could not read that file.');
        clearLoadedDocument();
        resolve(false);
      };
      reader.readAsText(file);
    });
  }

  /**
   * @param {google.maps.Map} mapInstance
   * @param {AppConfig} _config
   */
  function attachMap(mapInstance, _config) {
    map = mapInstance;
    overlay = createRadiusOverlay(map);
    infoWindow = new google.maps.InfoWindow();

    infoWindow.addListener('closeclick', () => {
      setActiveListRow(null);
    });

    if (loadedFile) {
      renderDocument(loadedFile);
    } else {
      updateMetaUi();
    }
  }

  function wireUpload() {
    const { fileInput } = els();
    fileInput?.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      void loadFromFile(file).finally(() => {
        // Allow re-selecting the same filename after a failed attempt.
        fileInput.value = '';
      });
    });
    updateMetaUi();
  }

  function refit() {
    if (loadedFile && overlay) {
      overlay.refit();
    }
  }

  return {
    attachMap,
    wireUpload,
    refit,
    hasDocument: () => Boolean(loadedFile),
    /** @internal test hook */
    loadFromText,
  };
}
