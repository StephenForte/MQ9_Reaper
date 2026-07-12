const mapsScriptId = 'google-maps-js';

/**
 * @typedef {{ lat: number, lng: number }} LatLng
 * @typedef {{
 *   mapsApiKey: string,
 *   defaults: {
 *     radiusMiles: number,
 *     dotCount: number,
 *     requiredSelections: number,
 *     mapType: string,
 *     center: LatLng,
 *   }
 * }} AppConfig
 */

/** @type {AppConfig | null} */
let runtimeConfig = null;

/** @type {Map<string, google.maps.Map>} */
const mapsByPanel = new Map();

/** @type {Promise<void> | null} */
let mapsReadyPromise = null;

async function fetchConfig() {
  const res = await fetch('/api/config');
  if (!res.ok) {
    throw new Error(`Failed to load config (${res.status})`);
  }
  return /** @type {Promise<AppConfig>} */ (res.json());
}

function showMapError(panel, title, message) {
  const el = document.getElementById(`map-${panel}-error`);
  if (!el) return;
  el.hidden = false;
  el.innerHTML = `<strong>${title}</strong><p>${message}</p>`;
}

function hideMapError(panel) {
  const el = document.getElementById(`map-${panel}-error`);
  if (!el) return;
  el.hidden = true;
  el.innerHTML = '';
}

/** Classic callback loader — waits until google.maps.Map is actually usable. */
function ensureMapsApi(apiKey) {
  if (mapsReadyPromise) return mapsReadyPromise;

  mapsReadyPromise = new Promise((resolve, reject) => {
    if (window.google?.maps?.Map) {
      resolve();
      return;
    }

    const callbackName = '__mq9MapsReady';
    window[callbackName] = () => {
      delete window[callbackName];
      if (window.google?.maps?.Map) {
        resolve();
      } else {
        reject(new Error('Maps JS loaded but google.maps.Map is unavailable'));
      }
    };

    const existing = document.getElementById(mapsScriptId);
    if (existing) {
      // Script already requested; wait for Map to appear.
      const started = Date.now();
      const poll = setInterval(() => {
        if (window.google?.maps?.Map) {
          clearInterval(poll);
          resolve();
        } else if (Date.now() - started > 15000) {
          clearInterval(poll);
          reject(new Error('Timed out waiting for Google Maps'));
        }
      }, 50);
      return;
    }

    const script = document.createElement('script');
    script.id = mapsScriptId;
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&callback=${callbackName}`;
    script.onerror = () => {
      delete window[callbackName];
      reject(new Error('Maps script failed to load'));
    };
    document.head.appendChild(script);
  }).catch((err) => {
    mapsReadyPromise = null;
    throw err;
  });

  return mapsReadyPromise;
}

/**
 * @param {'select' | 'review'} panel
 * @param {AppConfig} config
 */
function initMap(panel, config) {
  const container = document.getElementById(`map-${panel}`);
  if (!container || mapsByPanel.has(panel)) return;

  const map = new google.maps.Map(container, {
    center: config.defaults.center,
    zoom: 12,
    mapTypeId: config.defaults.mapType,
    disableDefaultUI: false,
    mapTypeControl: true,
    streetViewControl: false,
    fullscreenControl: true,
  });

  new google.maps.Marker({
    map,
    position: config.defaults.center,
    title: 'Phase 0 hardcoded center',
  });

  mapsByPanel.set(panel, map);
  hideMapError(panel);

  requestAnimationFrame(() => {
    google.maps.event.trigger(map, 'resize');
    map.setCenter(config.defaults.center);
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

function setActiveTab(tabName) {
  const tabs = document.querySelectorAll('.tab');
  const panels = document.querySelectorAll('.panel');

  tabs.forEach((tab) => {
    const active = tab.dataset.tab === tabName;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
  });

  panels.forEach((panel) => {
    const active = panel.id === `panel-${tabName}`;
    panel.classList.toggle('is-active', active);
    panel.hidden = !active;
  });

  const map = mapsByPanel.get(tabName);
  if (map && window.google?.maps) {
    requestAnimationFrame(() => {
      google.maps.event.trigger(map, 'resize');
      if (runtimeConfig) {
        map.setCenter(runtimeConfig.defaults.center);
      }
    });
  } else {
    ensureMap(/** @type {'select' | 'review'} */ (tabName));
  }
}

function wireTabs() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      setActiveTab(tab.dataset.tab || 'select');
    });
  });
}

function fillSelectMeta(config) {
  const { lat, lng } = config.defaults.center;
  const centerEl = document.getElementById('select-center-label');
  const typeEl = document.getElementById('select-map-type');
  if (centerEl) centerEl.textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  if (typeEl) typeEl.textContent = config.defaults.mapType;
}

async function boot() {
  wireTabs();

  try {
    runtimeConfig = await fetchConfig();
    fillSelectMeta(runtimeConfig);
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
