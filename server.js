require('dotenv').config();
const path = require('path');
const express = require('express');
const { appConfig } = require('./config');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

/** Public runtime config for the browser (Maps key only — never geocoding). */
app.get('/api/config', (_req, res) => {
  res.json({
    mapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '',
    defaults: {
      radiusMiles: appConfig.radiusMiles,
      dotCount: appConfig.dotCount,
      requiredSelections: appConfig.requiredSelections,
      mapType: appConfig.mapType,
      center: appConfig.defaultCenter,
    },
  });
});

/** Placeholder for Phase 1 — keeps env wiring visible and route reserved. */
app.get('/api/geocode', (_req, res) => {
  if (!process.env.GEOCODING_API_KEY) {
    return res.status(503).json({
      error: 'Geocoding is not configured yet (Phase 1). Set GEOCODING_API_KEY.',
    });
  }
  return res.status(501).json({
    error: 'Geocoding proxy not implemented yet (Phase 1).',
  });
});

app.listen(PORT, () => {
  console.log(`MQ9 Reaper listening on http://localhost:${PORT}`);
  if (!process.env.GOOGLE_MAPS_API_KEY) {
    console.warn('Warning: GOOGLE_MAPS_API_KEY is not set — map will show an error state.');
  }
});
