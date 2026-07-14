import { createAdminController } from './admin.js';
import { ensureMapsApi } from './maps-loader.js';
import { createReviewController } from './review.js';
import { createSelectionController } from './selection.js';
import { wireTabs } from './tabs.js';
import { hideMapError, showMapError } from './ui.js';

/**
 * @typedef {import('./app-types.js').AppConfig} AppConfig
 */

/** @type {AppConfig | null} */
let runtimeConfig = null;

/** @type {Map<string, google.maps.Map>} */
const mapsByPanel = new Map();

const selection = createSelectionController();
const review = createReviewController();
const admin = createAdminController();

async function fetchConfig() {
  const res = await fetch('/api/config');
  if (!res.ok) {
    throw new Error(`Failed to load config (${res.status})`);
  }
  return /** @type {Promise<AppConfig>} */ (res.json());
}

/**
 * @param {'select' | 'review'} panel
 * @param {AppConfig} config
 */
function initMap(panel, config) {
  const container = document.getElementById(`map-${panel}`);
  if (!container || mapsByPanel.has(panel)) return;

  const center =
    panel === 'select' && selection.getCenter()
      ? selection.getCenter()
      : config.defaults.center;

  const map = new google.maps.Map(container, {
    center,
    zoom: 12,
    mapTypeId: config.defaults.mapType,
    disableDefaultUI: false,
    mapTypeControl: true,
    streetViewControl: false,
    fullscreenControl: true,
  });

  mapsByPanel.set(panel, map);
  hideMapError(panel);

  if (panel === 'select') {
    selection.attachMap(map, config);
  } else {
    review.attachMap(map, config);
  }

  requestAnimationFrame(() => {
    google.maps.event.trigger(map, 'resize');
    if (panel === 'select') {
      selection.refit();
    } else {
      review.refit();
    }
  });
}

/**
 * @param {'select' | 'review'} panel
 */
async function ensureMap(panel) {
  if (!runtimeConfig) return;

  if (!runtimeConfig.mapsApiKey) {
    showMapError(
      panel,
      'Maps key missing',
      'Set GOOGLE_MAPS_API_KEY in the environment (see .env.example), then restart the server. Restrict the key by HTTP referrer and Maps JavaScript API only.'
    );
    return;
  }

  try {
    await ensureMapsApi(runtimeConfig.mapsApiKey);
    initMap(panel, runtimeConfig);
  } catch (err) {
    console.error(err);
    showMapError(
      panel,
      'Google Maps failed to load',
      err instanceof Error ? err.message : 'Maps JS failed to initialize.'
    );
  }
}

/**
 * @param {string} tabName
 */
function onTabActivate(tabName) {
  if (tabName === 'admin') return;

  if (tabName !== 'select' && tabName !== 'review') return;

  const map = mapsByPanel.get(tabName);
  if (map && window.google?.maps) {
    requestAnimationFrame(() => {
      google.maps.event.trigger(map, 'resize');
      if (tabName === 'select') {
        selection.refit();
      } else {
        review.refit();
      }
    });
    return;
  }
  ensureMap(tabName);
}

async function boot() {
  wireTabs({ onActivate: onTabActivate });
  selection.wireForms();
  review.wireUpload();
  admin.wireForms();

  try {
    runtimeConfig = await fetchConfig();
    admin.init(runtimeConfig);
    selection.fillDefaults(runtimeConfig);
    await ensureMap('select');
  } catch (err) {
    console.error(err);
    showMapError(
      'select',
      'Could not start',
      'Failed to load /api/config. Is the server running?'
    );
  }
}

boot();
