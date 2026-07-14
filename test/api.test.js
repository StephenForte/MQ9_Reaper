import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createApp } from '../server.js';

/**
 * @param {import('express').Express} app
 * @param {string} path
 */
async function getJson(app, path) {
  const server = app.listen(0);
  try {
    const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
    const res = await fetch(`http://127.0.0.1:${port}${path}`);
    const body = await res.json();
    return { status: res.status, body };
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

const stubConfig = {
  radiusMiles: 3,
  dotCount: 25,
  minSelections: 1,
  maxSelections: 12,
  blockExtraSelections: true,
  minDotSpacingMeters: 50,
  mapType: 'hybrid',
  radiusUnit: 'miles',
  confirmOnRecenter: true,
  seededRng: false,
  defaultCenter: { lat: 37.8, lng: -121.7 },
};

describe('/api/health', () => {
  it('reports key configuration without probing by default', async () => {
    const app = createApp({
      mapsKey: 'maps',
      geocodingKey: '',
      config: stubConfig,
    });
    const { status, body } = await getJson(app, '/api/health');
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.mapsKeyConfigured, true);
    assert.equal(body.geocodingConfigured, false);
    assert.equal(body.geocodingProbe, undefined);
  });

  it('probes geocoding when ?probe=geocode', async () => {
    const app = createApp({
      mapsKey: 'maps',
      geocodingKey: 'geo',
      config: stubConfig,
      geocodeFn: async () => ({
        ok: true,
        lat: 37.4,
        lng: -122.0,
        formattedAddress: 'MV',
        addressComponents: [],
        types: [],
      }),
    });
    const { status, body } = await getJson(app, '/api/health?probe=geocode');
    assert.equal(status, 200);
    assert.equal(body.geocodingProbe.ok, true);
    assert.equal(body.geocodingProbe.lat, 37.4);
  });

  it('reports probe failure when geocoding key is missing', async () => {
    const app = createApp({
      mapsKey: '',
      geocodingKey: '',
      config: stubConfig,
    });
    const { body } = await getJson(app, '/api/health?probe=geocode');
    assert.equal(body.geocodingProbe.ok, false);
    assert.match(body.geocodingProbe.error, /GEOCODING_API_KEY/);
  });
});

describe('/api/config', () => {
  it('exposes maps key and defaults including blockExtraSelections', async () => {
    const app = createApp({
      mapsKey: 'browser-key',
      geocodingKey: 'server-secret',
      config: stubConfig,
    });
    const { status, body } = await getJson(app, '/api/config');
    assert.equal(status, 200);
    assert.equal(body.mapsApiKey, 'browser-key');
    assert.equal(body.defaults.blockExtraSelections, true);
    assert.equal(body.defaults.maxSelections, 12);
    assert.equal(JSON.stringify(body).includes('server-secret'), false);
  });
});

describe('/api/geocode', () => {
  it('returns 400 when q is missing', async () => {
    const app = createApp({
      mapsKey: '',
      geocodingKey: 'geo',
      config: stubConfig,
    });
    const { status, body } = await getJson(app, '/api/geocode');
    assert.equal(status, 400);
    assert.match(body.error, /Missing address/);
  });

  it('returns 503 when geocoding is not configured', async () => {
    const app = createApp({
      mapsKey: '',
      geocodingKey: '',
      config: stubConfig,
    });
    const { status, body } = await getJson(app, '/api/geocode?q=test');
    assert.equal(status, 503);
    assert.match(body.error, /GEOCODING_API_KEY/);
  });

  it('proxies geocode failures with status', async () => {
    const app = createApp({
      mapsKey: '',
      geocodingKey: 'geo',
      config: stubConfig,
      geocodeFn: async () => ({
        ok: false,
        status: 404,
        error: "Couldn't find that address",
        googleStatus: 'ZERO_RESULTS',
      }),
    });
    const { status, body } = await getJson(app, '/api/geocode?q=nowhere');
    assert.equal(status, 404);
    assert.equal(body.error, "Couldn't find that address");
    assert.equal(body.status, 'ZERO_RESULTS');
  });
});
