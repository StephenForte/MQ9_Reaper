import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  distanceMeters,
  generateCandidateDots,
  samplePointInDisk,
} from '../public/js/dots.js';
import { METERS_PER_MILE } from '../public/js/constants.js';

/** Deterministic PRNG for reproducible packing tests. */
function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

describe('distanceMeters', () => {
  it('is ~0 for identical points and scales with separation', () => {
    const a = { lat: 37.8, lng: -121.7 };
    assert.ok(distanceMeters(a, a) < 1e-6);
    const near = { lat: 37.801, lng: -121.7 };
    const far = { lat: 37.81, lng: -121.7 };
    assert.ok(distanceMeters(a, far) > distanceMeters(a, near));
  });
});

describe('samplePointInDisk', () => {
  it('keeps samples inside the radius (approx meters)', () => {
    const center = { lat: 37.8, lng: -121.7 };
    const radiusMeters = 3 * METERS_PER_MILE;
    const random = mulberry32(42);

    for (let i = 0; i < 200; i += 1) {
      const point = samplePointInDisk(center, radiusMeters, random);
      const dist = distanceMeters(center, point);
      assert.ok(dist <= radiusMeters + 1, `point outside disk: ${dist}`);
    }
  });
});

describe('generateCandidateDots', () => {
  it('returns exact count with stable ids', () => {
    const dots = generateCandidateDots({
      center: { lat: 37.8, lng: -121.7 },
      radiusMiles: 3,
      count: 25,
      minSpacingMeters: 50,
      random: mulberry32(7),
    });

    assert.equal(dots.length, 25);
    assert.equal(dots[0].id, 'd-01');
    assert.equal(dots[24].id, 'd-25');
    assert.ok(dots.every((dot) => dot.selected === false));
  });

  it('enforces minimum spacing when packing succeeds', () => {
    const minSpacing = 50;
    const dots = generateCandidateDots({
      center: { lat: 37.8, lng: -121.7 },
      radiusMiles: 3,
      count: 25,
      minSpacingMeters: minSpacing,
      maxAttemptsPerDot: 200,
      random: mulberry32(99),
    });

    for (let i = 0; i < dots.length; i += 1) {
      for (let j = i + 1; j < dots.length; j += 1) {
        const dist = distanceMeters(dots[i], dots[j]);
        assert.ok(
          dist >= minSpacing - 0.01,
          `dots ${dots[i].id} and ${dots[j].id} too close: ${dist}`
        );
      }
    }
  });

  it('still returns exact count when spacing is impossible', () => {
    const dots = generateCandidateDots({
      center: { lat: 0, lng: 0 },
      radiusMiles: 0.01,
      count: 10,
      minSpacingMeters: 5000,
      maxAttemptsPerDot: 5,
      random: mulberry32(1),
    });
    assert.equal(dots.length, 10);
  });
});
