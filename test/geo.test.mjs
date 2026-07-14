import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { radiusOffsetDegrees, parseCoordinate, validateLatLng } from '../public/js/geo.js';
import { METERS_PER_DEG_LAT, METERS_PER_MILE } from '../public/js/constants.js';

describe('radiusOffsetDegrees', () => {
  it('matches meters-per-degree at the equator', () => {
    const { dLat, dLng } = radiusOffsetDegrees({ lat: 0, lng: 0 }, METERS_PER_DEG_LAT);
    assert.ok(Math.abs(dLat - 1) < 1e-9);
    assert.ok(Math.abs(dLng - 1) < 1e-9);
  });

  it('widens longitude degrees at higher latitudes', () => {
    const equator = radiusOffsetDegrees({ lat: 0, lng: 0 }, 3 * METERS_PER_MILE);
    const mid = radiusOffsetDegrees({ lat: 45, lng: 0 }, 3 * METERS_PER_MILE);
    assert.equal(equator.dLat, mid.dLat);
    assert.ok(mid.dLng > equator.dLng);
  });
});

describe('parseCoordinate', () => {
  it('parses finite numbers and rejects junk', () => {
    assert.equal(parseCoordinate('37.5'), 37.5);
    assert.equal(parseCoordinate('  -121.7 '), -121.7);
    assert.equal(parseCoordinate(''), null);
    assert.equal(parseCoordinate('abc'), null);
  });
});

describe('validateLatLng', () => {
  it('accepts valid ranges', () => {
    assert.equal(validateLatLng(37.8, -121.7), null);
  });

  it('rejects out-of-range values', () => {
    assert.match(validateLatLng(91, 0) || '', /Latitude/);
    assert.match(validateLatLng(0, 181) || '', /Longitude/);
  });

  it('rejects non-numeric and non-finite values', () => {
    assert.match(validateLatLng('37', -121) || '', /numbers/);
    assert.match(validateLatLng(Number.NaN, 0) || '', /finite/);
  });
});

