/**
 * Selection-tab location / radius form wiring (keeps selection.js focused on map state).
 */

import { byIdAs } from './dom.js';
import { parseCoordinate, validateLatLng } from './geo.js';
import { regionLabelFromGeocode } from './place-names.js';
import { setFieldError } from './ui.js';

/**
 * @typedef {{ lat: number, lng: number }} LatLng
 * @typedef {'address' | 'click' | 'latlng' | 'default'} CenterSource
 */

/**
 * @param {{
 *   setCenter: (center: LatLng, source: CenterSource, opts?: { regionLabel?: string }) => Promise<boolean>,
 *   applyRadiusFromInput: () => Promise<boolean>,
 *   loadDots: () => Promise<boolean>,
 *   saveTargets: () => void | Promise<void>,
 *   downloadTargets: () => void,
 *   updateMeta: () => void,
 *   updateSelectionUi: () => void,
 * }} handlers
 */
export function wireSelectionForms(handlers) {
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

    if (geocodeBtn) {
      geocodeBtn.disabled = true;
      geocodeBtn.textContent = 'Geocoding…';
    }

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

      const label = regionLabelFromGeocode(
        body.addressComponents || [],
        body.formattedAddress || q
      );
      await handlers.setCenter(
        { lat: body.lat, lng: body.lng },
        'address',
        { regionLabel: label }
      );
    } catch (err) {
      console.error(err);
      setFieldError(
        'address-error',
        'Geocoding request failed. Try again, or use map click / lat-long.'
      );
    } finally {
      if (geocodeBtn) {
        geocodeBtn.disabled = false;
        geocodeBtn.textContent = 'Geocode address';
      }
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

    const applied = await handlers.setCenter(
      { lat: /** @type {number} */ (lat), lng: /** @type {number} */ (lng) },
      'latlng'
    );
    if (!applied) {
      handlers.updateMeta();
    }
  });

  radiusForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    void handlers.applyRadiusFromInput();
  });

  loadDotsBtn?.addEventListener('click', () => {
    void handlers.loadDots();
  });

  saveBtn?.addEventListener('click', () => {
    if (saveBtn.disabled) return;
    void handlers.saveTargets();
  });

  downloadBtn?.addEventListener('click', () => {
    if (downloadBtn.disabled) return;
    handlers.downloadTargets();
  });

  handlers.updateSelectionUi();
}
