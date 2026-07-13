import { ensureMapsApi } from './maps-loader.js';
import { createSelectionController } from './selection.js';
import { wireTabs } from './tabs.js';
import { hideMapError, showMapError } from './ui.js';

/**
 * @typedef {{ lat: number, lng: number }} LatLng
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

/** @type {AppConfig | null} */
let runtimeConfig = null;

/** @type {Map<string, google.maps.Map>} */
const mapsByPanel = new Map();

const selection = createSelectionController();

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
    new google.maps.Marker({
      map,
      position: config.defaults.center,
      title: 'Default center (Review arrives in Phase 4)',
    });
  }

  requestAnimationFrame(() => {
    google.maps.event.trigger(map, 'resize');
    if (panel === 'select') {
      selection.refit();
    } else {
      map.setCenter(config.defaults.center);
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
 * @param {'select' | 'review'} tabName
 */
function onTabActivate(tabName) {
  const map = mapsByPanel.get(tabName);
  if (map && window.google?.maps) {
    requestAnimationFrame(() => {
      google.maps.event.trigger(map, 'resize');
      if (tabName === 'select') {
        selection.refit();
      } else if (runtimeConfig) {
        map.setCenter(runtimeConfig.defaults.center);
      }
    });
    return;
  }
  ensureMap(tabName);
}

async function boot() {
  wireTabs({ onActivate: onTabActivate });
  selection.wireForms();

  try {
    runtimeConfig = await fetchConfig();
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
