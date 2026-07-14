import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  boundsCornersForRadius,
  parseCoordinate,
  radiusOffsetDegrees,
  validateLatLng,
} from '../public/js/geo.js';
import { METERS_PER_DEG_LAT, METERS_PER_MILE } from '../public/js/constants.js';

describe('radiusOffsetDegrees', () => {
  it('matches meters-per-degree at the equator', () => {
    const { dLat, dLng } = radiusOffsetDegrees({ lat: 0, lng: 0 }, METERS_PER_DEG_LAT);
    assert.equal(dLat, 1);
    assert.ok(Math.abs(dLng - 1) < 1e-9);
  });

  it('widens longitude degrees at higher latitudes', () => {
    const equator = radiusOffsetDegrees({ lat: 0, lng: 0 }, 1609.344);
    const north = radiusOffsetDegrees({ lat: 60, lng: 0 }, 1609.344);
    assert.equal(equator.dLat, north.dLat);
    assert.ok(north.dLng > equator.dLng);
  });
});

describe('boundsCornersForRadius', () => {
  it('returns a box centered on the point spanning ±radius', () => {
    const center = { lat: 37.8, lng: -121.7 };
    const radiusMeters = 3 * METERS_PER_MILE;
    const { sw, ne } = boundsCornersForRadius(center, radiusMeters);
    assert.ok(sw.lat < center.lat && ne.lat > center.lat);
    assert.ok(sw.lng < center.lng && ne.lng > center.lng);
    assert.ok(
      Math.abs((ne.lat - sw.lat) / 2 - radiusMeters / METERS_PER_DEG_LAT) < 1e-9
    );
  });
});

describe('parseCoordinate', () => {
  it('parses finite numbers and rejects junk', () => {
    assert.equal(parseCoordinate(' 37.5 '), 37.5);
    assert.equal(parseCoordinate(''), null);
    assert.equal(parseCoordinate('  '), null);
    assert.equal(parseCoordinate('abc'), null);
    assert.equal(parseCoordinate('Infinity'), null);
  });
});

describe('validateLatLng', () => {
  it('accepts valid ranges', () => {
    assert.equal(validateLatLng(0, 0), null);
    assert.equal(validateLatLng(90, 180), null);
    assert.equal(validateLatLng(-90, -180), null);
  });

  it('rejects out-of-range values', () => {
    assert.match(validateLatLng(91, 0) || '', /Latitude/);
    assert.match(validateLatLng(0, 181) || '', /Longitude/);
  });

  it('rejects non-numeric and non-finite values', () => {
    assert.match(validateLatLng('1', 2) || '', /must be numbers/);
    assert.match(validateLatLng(NaN, 0) || '', /finite/);
    assert.match(validateLatLng(0, Infinity) || '', /finite/);
  });
});
