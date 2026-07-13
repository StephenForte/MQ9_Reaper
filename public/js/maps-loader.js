import { MAPS_SCRIPT_ID } from './constants.js';

/** @type {Promise<void> | null} */
let mapsReadyPromise = null;

/**
 * Classic callback loader — waits until google.maps.Map is usable.
 * @param {string} apiKey
 * @returns {Promise<void>}
 */
export function ensureMapsApi(apiKey) {
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

    const existing = document.getElementById(MAPS_SCRIPT_ID);
    if (existing) {
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
    script.id = MAPS_SCRIPT_ID;
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
