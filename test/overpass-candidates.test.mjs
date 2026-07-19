import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  candidateIdAt,
  pickSpacedPlaces,
  loadOverpassCandidates,
} from '../public/js/overpass-candidates.js';

describe('candidateIdAt / pickSpacedPlaces', () => {
  it('formats ids like d-01', () => {
    assert.equal(candidateIdAt(0), 'd-01');
    assert.equal(candidateIdAt(11), 'd-12');
  });

  it('keeps spaced places up to count', () => {
    const kept = pickSpacedPlaces(
      [
        { lat: 0, lng: 0, name: 'A' },
        { lat: 0.0001, lng: 0, name: 'too-close' },
        { lat: 1, lng: 1, name: 'B' },
      ],
      { count: 2, minSpacingMeters: 50 }
    );
    assert.equal(kept.length, 2);
    assert.equal(kept[0].name, 'A');
    assert.equal(kept[1].name, 'B');
  });
});

describe('loadOverpassCandidates', () => {
  it('maps Overpass places to candidate dots', async () => {
    const result = await loadOverpassCandidates({
      center: { lat: 37.8, lng: -121.7 },
      radiusMiles: 3,
      count: 2,
      minSpacingMeters: 0,
      fillRandom: false,
      fetchFn: async () =>
        /** @type {Response} */ ({
          ok: true,
          async json() {
            return {
              places: [
                { lat: 37.81, lng: -121.71, name: 'Park', osmType: 'way', osmId: 1 },
                { lat: 37.82, lng: -121.72, name: 'School', osmType: 'node', osmId: 2 },
              ],
              queryRadiusMiles: 3,
            };
          },
        }),
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.candidates.length, 2);
    assert.equal(result.candidates[0].id, 'd-01');
    assert.equal(result.candidates[0].name, 'Park');
    assert.equal(result.candidates[0].source, 'overpass');
    assert.equal(result.overpassCount, 2);
    assert.equal(result.filledRandom, 0);
  });

  it('fills with random when under count', async () => {
    const result = await loadOverpassCandidates({
      center: { lat: 37.8, lng: -121.7 },
      radiusMiles: 3,
      count: 4,
      minSpacingMeters: 0,
      fillRandom: true,
      fetchFn: async () =>
        /** @type {Response} */ ({
          ok: true,
          async json() {
            return {
              places: [
                { lat: 37.81, lng: -121.71, name: 'Only', osmType: 'node', osmId: 1 },
              ],
              queryRadiusMiles: 3,
            };
          },
        }),
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.candidates.length, 4);
    assert.equal(result.overpassCount, 1);
    assert.equal(result.filledRandom, 3);
    assert.equal(result.candidates.filter((c) => c.source === 'random').length, 3);
  });

  it('surfaces API errors', async () => {
    const result = await loadOverpassCandidates({
      center: { lat: 1, lng: 2 },
      radiusMiles: 1,
      count: 5,
      fetchFn: async () =>
        /** @type {Response} */ ({
          ok: false,
          async json() {
            return { error: 'OpenStreetMap query timed out. Try a smaller radius, or use random targets.' };
          },
        }),
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, /timed out/);
  });
});
