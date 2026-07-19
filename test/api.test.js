import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { createApp } from '../server.js';
import { createTargetsStore } from '../lib/targets-store.js';

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
  candidateSource: 'overpass',
  overpassFillRandom: true,
  defaultCenter: { lat: 37.8, lng: -121.7 },
};

function ephemeralTargets() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mq9-api-'));
  return {
    dir,
    store: createTargetsStore(dir),
  };
}

describe('/api/health', () => {
  it('reports key configuration without probing by default', async () => {
    const { dir, store } = ephemeralTargets();
    try {
      const app = createApp({
        mapsKey: 'maps',
        geocodingKey: '',
        config: stubConfig,
        adminUsername: '',
        adminPassword: '',
        targetsStore: store,
        targetsPath: dir,
        targetsPersistent: false,
        mcpApiKey: '',
        mcpOauthClientId: '',
        mcpOauthClientSecret: '',
      });
      const { status, body } = await getJson(app, '/api/health');
      assert.equal(status, 200);
      assert.equal(body.ok, true);
      assert.equal(body.mapsKeyConfigured, true);
      assert.equal(body.geocodingConfigured, false);
      assert.equal(body.adminConfigured, false);
      assert.equal(body.mcpConfigured, false);
      assert.equal(body.mcpOauthConfigured, false);
      assert.equal(typeof body.configPersistent, 'boolean');
      assert.equal(body.targetsPersistent, false);
      assert.equal(body.geocodingProbe, undefined);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
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
      adminUsername: '',
      adminPassword: '',
    });
    const { status, body } = await getJson(app, '/api/config');
    assert.equal(status, 200);
    assert.equal(body.mapsApiKey, 'browser-key');
    assert.equal(body.adminConfigured, false);
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

  it('returns lat/lng on success', async () => {
    const app = createApp({
      mapsKey: '',
      geocodingKey: 'geo',
      config: stubConfig,
      geocodeFn: async (q) => ({
        ok: true,
        lat: 10,
        lng: 20,
        formattedAddress: q,
        addressComponents: [],
        types: ['street_address'],
      }),
    });
    const { status, body } = await getJson(app, '/api/geocode?q=Home');
    assert.equal(status, 200);
    assert.equal(body.lat, 10);
    assert.equal(body.lng, 20);
    assert.equal(body.formattedAddress, 'Home');
  });
});

describe('/api/geocode/reverse', () => {
  it('returns 400 for missing or out-of-range coordinates', async () => {
    const app = createApp({
      mapsKey: '',
      geocodingKey: 'geo',
      config: stubConfig,
    });
    const missing = await getJson(app, '/api/geocode/reverse');
    assert.equal(missing.status, 400);
    const bad = await getJson(app, '/api/geocode/reverse?lat=91&lng=0');
    assert.equal(bad.status, 400);
    assert.match(bad.body.error, /out of range/);
  });

  it('returns 503 when geocoding is not configured', async () => {
    const app = createApp({
      mapsKey: '',
      geocodingKey: '',
      config: stubConfig,
    });
    const { status, body } = await getJson(
      app,
      '/api/geocode/reverse?lat=1&lng=2'
    );
    assert.equal(status, 503);
    assert.match(body.error, /GEOCODING_API_KEY/);
  });

  it('proxies reverse geocode success and failure', async () => {
    const okApp = createApp({
      mapsKey: '',
      geocodingKey: 'geo',
      config: stubConfig,
      reverseGeocodeFn: async () => ({
        ok: true,
        formattedAddress: 'Somewhere',
        addressComponents: [],
        types: ['locality'],
        results: [{ types: ['locality'] }],
      }),
    });
    const ok = await getJson(okApp, '/api/geocode/reverse?lat=37&lng=-121');
    assert.equal(ok.status, 200);
    assert.equal(ok.body.formattedAddress, 'Somewhere');

    const failApp = createApp({
      mapsKey: '',
      geocodingKey: 'geo',
      config: stubConfig,
      reverseGeocodeFn: async () => ({
        ok: false,
        status: 404,
        error: 'No address found for that location.',
        googleStatus: 'ZERO_RESULTS',
      }),
    });
    const fail = await getJson(
      failApp,
      '/api/geocode/reverse?lat=1&lng=2'
    );
    assert.equal(fail.status, 404);
    assert.match(fail.body.error, /No address found/);
  });
});

describe('/api/overpass', () => {
  it('returns 400 when lat/lng missing', async () => {
    const app = createApp({
      mapsKey: '',
      geocodingKey: '',
      config: stubConfig,
    });
    const { status, body } = await getJson(app, '/api/overpass?radiusMiles=3');
    assert.equal(status, 400);
    assert.match(body.error, /lat and lng/);
  });

  it('returns 400 for non-positive radius', async () => {
    const app = createApp({
      mapsKey: '',
      geocodingKey: '',
      config: stubConfig,
    });
    const { status, body } = await getJson(
      app,
      '/api/overpass?lat=37.8&lng=-121.7&radiusMiles=0'
    );
    assert.equal(status, 400);
    assert.match(body.error, /radiusMiles/);
  });

  it('proxies Overpass places via injectable overpassFn', async () => {
    const app = createApp({
      mapsKey: '',
      geocodingKey: '',
      config: stubConfig,
      overpassFn: async () => ({
        ok: true,
        places: [
          {
            lat: 37.8,
            lng: -121.7,
            name: 'City Park',
            osmType: 'way',
            osmId: 1,
            kind: 'park',
          },
        ],
        queryRadiusMiles: 3,
      }),
    });
    const { status, body } = await getJson(
      app,
      '/api/overpass?lat=37.8&lng=-121.7&radiusMiles=3&limit=10'
    );
    assert.equal(status, 200);
    assert.equal(body.places.length, 1);
    assert.equal(body.places[0].name, 'City Park');
    assert.equal(body.queryRadiusMiles, 3);
  });

  it('proxies Overpass failures with status', async () => {
    const app = createApp({
      mapsKey: '',
      geocodingKey: '',
      config: stubConfig,
      overpassFn: async () => ({
        ok: false,
        status: 502,
        error: 'OpenStreetMap service unreachable. Try again, or use random targets.',
      }),
    });
    const { status, body } = await getJson(
      app,
      '/api/overpass?lat=1&lng=2&radiusMiles=1'
    );
    assert.equal(status, 502);
    assert.match(body.error, /unreachable/);
  });
});
