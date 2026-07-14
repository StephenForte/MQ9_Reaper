import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { appConfig } from './config.js';
import { geocodeAddress, reverseGeocode } from './lib/geocode.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

/** Liveness for Render / local smoke checks. */
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    mapsKeyConfigured: Boolean(process.env.GOOGLE_MAPS_API_KEY),
    geocodingConfigured: Boolean(process.env.GEOCODING_API_KEY),
  });
});

/** Public runtime config for the browser (Maps key only — never geocoding). */
app.get('/api/config', (_req, res) => {
  res.json({
    mapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '',
    defaults: {
      radiusMiles: appConfig.radiusMiles,
      dotCount: appConfig.dotCount,
      minSelections: appConfig.minSelections,
      maxSelections: appConfig.maxSelections,
      minDotSpacingMeters: appConfig.minDotSpacingMeters,
      mapType: appConfig.mapType,
      radiusUnit: appConfig.radiusUnit,
      confirmOnRecenter: appConfig.confirmOnRecenter,
      seededRng: appConfig.seededRng,
      center: appConfig.defaultCenter,
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

  const key = process.env.GEOCODING_API_KEY;
  if (!key) {
    return res.status(503).json({
      error: 'Geocoding is not configured. Set GEOCODING_API_KEY on the server.',
    });
  }

  try {
    const result = await geocodeAddress(q, key);
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

  const key = process.env.GEOCODING_API_KEY;
  if (!key) {
    return res.status(503).json({
      error: 'Geocoding is not configured. Set GEOCODING_API_KEY on the server.',
    });
  }

  try {
    const result = await reverseGeocode(lat, lng, key);
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
