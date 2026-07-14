import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { fetchReverseGeocode } from '../public/js/reverse-geocode.js';

describe('fetchReverseGeocode', () => {
  it('returns ok payload on success', async () => {
    mock.method(globalThis, 'fetch', async (url) => {
      assert.match(String(url), /\/api\/geocode\/reverse\?lat=37&lng=-121/);
      return {
        ok: true,
        json: async () => ({
          formattedAddress: 'Somewhere',
          addressComponents: [{ long_name: 'X' }],
          types: ['locality'],
          results: [{ types: ['locality'] }],
        }),
      };
    });

    const result = await fetchReverseGeocode(37, -121);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.formattedAddress, 'Somewhere');
      assert.equal(result.results.length, 1);
    }
    mock.restoreAll();
  });

  it('maps non-OK responses to ok:false with status', async () => {
    mock.method(globalThis, 'fetch', async () => ({
      ok: false,
      status: 503,
      json: async () => ({ error: 'Geocoding is not configured.' }),
    }));

    const result = await fetchReverseGeocode(1, 2);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 503);
      assert.match(result.error, /not configured/);
    }
    mock.restoreAll();
  });

  it('uses fallback error when body has no error string', async () => {
    mock.method(globalThis, 'fetch', async () => ({
      ok: false,
      status: 502,
      json: async () => ({}),
    }));

    const result = await fetchReverseGeocode(1, 2);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /Reverse geocoding request failed/);
    }
    mock.restoreAll();
  });

  it('returns status 0 on network failure', async () => {
    mock.method(globalThis, 'fetch', async () => {
      throw new Error('offline');
    });

    const result = await fetchReverseGeocode(1, 2);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 0);
    }
    mock.restoreAll();
  });
});
