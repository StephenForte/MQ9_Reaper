import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { geocodeAddress, reverseGeocode } from '../lib/geocode.js';

describe('geocodeAddress', () => {
  it('maps ZERO_RESULTS to the PRD address message', async () => {
    mock.method(globalThis, 'fetch', async () => ({
      ok: true,
      json: async () => ({ status: 'ZERO_RESULTS' }),
    }));

    const result = await geocodeAddress('nowhere', 'test-key');
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 404);
      assert.equal(result.error, "Couldn't find that address");
      assert.equal(result.googleStatus, 'ZERO_RESULTS');
    }

    mock.restoreAll();
  });

  it('detects referrer-restricted key misconfiguration', async () => {
    mock.method(globalThis, 'fetch', async () => ({
      ok: true,
      json: async () => ({
        status: 'REQUEST_DENIED',
        error_message: 'API keys with referer restrictions cannot be used with this API.',
      }),
    }));

    const result = await geocodeAddress('test', 'bad-key');
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 502);
      assert.match(result.error, /without HTTP referrer restrictions/);
    }

    mock.restoreAll();
  });

  it('returns coordinates on OK', async () => {
    mock.method(globalThis, 'fetch', async () => ({
      ok: true,
      json: async () => ({
        status: 'OK',
        results: [
          {
            geometry: { location: { lat: 37.4, lng: -122.0 } },
            formatted_address: 'Mountain View, CA',
            address_components: [],
            types: ['street_address'],
          },
        ],
      }),
    }));

    const result = await geocodeAddress('ok', 'key');
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.lat, 37.4);
      assert.equal(result.lng, -122.0);
      assert.equal(result.formattedAddress, 'Mountain View, CA');
    }

    mock.restoreAll();
  });

  it('surfaces network failures as retryable 502', async () => {
    mock.method(globalThis, 'fetch', async () => {
      throw new Error('network down');
    });

    const result = await geocodeAddress('x', 'key');
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 502);
      assert.match(result.error, /Try again/);
    }

    mock.restoreAll();
  });
});

describe('reverseGeocode', () => {
  it('returns results on OK', async () => {
    mock.method(globalThis, 'fetch', async () => ({
      ok: true,
      json: async () => ({
        status: 'OK',
        results: [
          {
            formatted_address: 'Somewhere',
            address_components: [],
            types: ['locality'],
          },
        ],
      }),
    }));

    const result = await reverseGeocode(1, 2, 'key');
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.formattedAddress, 'Somewhere');
      assert.equal(result.results.length, 1);
    }

    mock.restoreAll();
  });
});
