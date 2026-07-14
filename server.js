import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express from 'express';
import { appConfig } from './config.js';
import { geocodeAddress, reverseGeocode } from './lib/geocode.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * @param {{
 *   mapsKey?: string,
 *   geocodingKey?: string,
 *   config?: typeof appConfig,
 *   geocodeFn?: typeof geocodeAddress,
 *   reverseGeocodeFn?: typeof reverseGeocode,
 * }} [deps]
 */
export function createApp(deps = {}) {
  const mapsKey =
    deps.mapsKey !== undefined
      ? deps.mapsKey
      : process.env.GOOGLE_MAPS_API_KEY || '';
  const geocodingKey =
    deps.geocodingKey !== undefined
      ? deps.geocodingKey
      : process.env.GEOCODING_API_KEY || '';
  const config = deps.config || appConfig;
  const geocodeFn = deps.geocodeFn || geocodeAddress;
  const reverseGeocodeFn = deps.reverseGeocodeFn || reverseGeocode;

  const app = express();
  app.use(express.static(path.join(__dirname, 'public')));

  /** Liveness for Render / local smoke checks. Use ?probe=geocode for key smoke. */
  app.get('/api/health', async (req, res) => {
    const payload = {
      ok: true,
      mapsKeyConfigured: Boolean(mapsKey),
      geocodingConfigured: Boolean(geocodingKey),
    };

    if (req.query.probe !== 'geocode') {
      return res.json(payload);
    }

    if (!geocodingKey) {
      return res.json({
        ...payload,
        geocodingProbe: {
          ok: false,
          error: 'GEOCODING_API_KEY is not set.',
        },
      });
    }

    try {
      const result = await geocodeFn('1600 Amphitheatre Parkway, Mountain View, CA', geocodingKey);
      if (!result.ok) {
        return res.json({
          ...payload,
          geocodingProbe: {
            ok: false,
            error: result.error,
            googleStatus: result.googleStatus || null,
          },
        });
      }
      return res.json({
        ...payload,
        geocodingProbe: {
          ok: true,
          lat: result.lat,
          lng: result.lng,
        },
      });
    } catch (err) {
      console.error('Health geocode probe error:', err);
      return res.json({
        ...payload,
        geocodingProbe: {
          ok: false,
          error: 'Geocoding probe failed unexpectedly.',
        },
      });
    }
  });

  /** Public runtime config for the browser (Maps key only — never geocoding). */
  app.get('/api/config', (_req, res) => {
    res.json({
      mapsApiKey: mapsKey,
      defaults: {
        radiusMiles: config.radiusMiles,
        dotCount: config.dotCount,
        minSelections: config.minSelections,
        maxSelections: config.maxSelections,
        blockExtraSelections: config.blockExtraSelections,
        minDotSpacingMeters: config.minDotSpacingMeters,
        mapType: config.mapType,
        radiusUnit: config.radiusUnit,
        confirmOnRecenter: config.confirmOnRecenter,
        seededRng: config.seededRng,
        center: config.defaultCenter,
      },
    });
  });

  /**
   * Server-side geocode proxy (PRD §7.3).
   * Returns only lat/lng (+ address metadata); never exposes GEOCODING_API_KEY.
   */
  app.get('/api/geocode', async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q) {
      return res.status(400).json({ error: 'Missing address. Pass ?q=...' });
    }

    if (!geocodingKey) {
      return res.status(503).json({
        error: 'Geocoding is not configured. Set GEOCODING_API_KEY on the server.',
      });
    }

    try {
      const result = await geocodeFn(q, geocodingKey);
      if (!result.ok) {
        const payload = { error: result.error };
        if (result.googleStatus) payload.status = result.googleStatus;
        return res.status(result.status).json(payload);
      }

      return res.json({
        lat: result.lat,
        lng: result.lng,
        formattedAddress: result.formattedAddress,
        addressComponents: result.addressComponents,
        types: result.types,
      });
    } catch (err) {
      console.error('Geocode proxy error:', err);
      return res.status(502).json({
        error: 'Geocoding request failed. Try again, or use map click / lat-long.',
      });
    }
  });

  /**
   * Reverse geocode proxy — region labels and per-target place names.
   */
  app.get('/api/geocode/reverse', async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'Pass numeric lat and lng query params.' });
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ error: 'lat/lng out of range.' });
    }

    if (!geocodingKey) {
      return res.status(503).json({
        error: 'Geocoding is not configured. Set GEOCODING_API_KEY on the server.',
      });
    }

    try {
      const result = await reverseGeocodeFn(lat, lng, geocodingKey);
      if (!result.ok) {
        const payload = { error: result.error };
        if (result.googleStatus) payload.status = result.googleStatus;
        return res.status(result.status).json(payload);
      }

      return res.json({
        formattedAddress: result.formattedAddress,
        addressComponents: result.addressComponents,
        types: result.types,
        results: result.results,
      });
    } catch (err) {
      console.error('Reverse geocode proxy error:', err);
      return res.status(502).json({ error: 'Reverse geocoding request failed.' });
    }
  });

  return app;
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  const PORT = process.env.PORT || 3000;
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`MQ9 Reaper listening on http://localhost:${PORT}`);
    if (!process.env.GOOGLE_MAPS_API_KEY) {
      console.warn(
        'Warning: GOOGLE_MAPS_API_KEY is not set — map will show an error state.'
      );
    }
    if (!process.env.GEOCODING_API_KEY) {
      console.warn(
        'Warning: GEOCODING_API_KEY is not set — address geocoding will return 503.'
      );
    }
  });
}
