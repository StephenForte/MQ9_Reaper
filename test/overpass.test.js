import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildOverpassQuery,
  nameFromOsmTags,
  placeFromOverpassElement,
  placesFromOverpassResponse,
  queryOverpassPlaces,
} from '../lib/overpass.js';

describe('nameFromOsmTags', () => {
  it('prefers name, then name:en, then kind label', () => {
    assert.equal(nameFromOsmTags({ name: 'City Hall' }), 'City Hall');
    assert.equal(nameFromOsmTags({ 'name:en': 'Museum' }), 'Museum');
    assert.equal(nameFromOsmTags({ amenity: 'fire_station' }), 'fire station');
    assert.equal(nameFromOsmTags({}), null);
  });
});

describe('buildOverpassQuery', () => {
  it('includes around filter and out center tags', () => {
    const q = buildOverpassQuery({
      lat: 37.8,
      lng: -121.7,
      radiusMeters: 4828,
    });
    assert.match(q, /around:4828,37\.8,-121\.7/);
    assert.match(q, /out center tags/);
    assert.match(q, /amenity/);
    assert.match(q, /leisure/);
  });
});

describe('placeFromOverpassElement / placesFromOverpassResponse', () => {
  it('reads node lat/lon and way center', () => {
    const node = placeFromOverpassElement({
      type: 'node',
      id: 10,
      lat: 37.1,
      lon: -121.2,
      tags: { name: 'Park', leisure: 'park' },
    });
    assert.deepEqual(node, {
      lat: 37.1,
      lng: -121.2,
      name: 'Park',
      osmType: 'node',
      osmId: 10,
      kind: 'park',
    });

    const way = placeFromOverpassElement({
      type: 'way',
      id: 20,
      center: { lat: 38, lon: -122 },
      tags: { amenity: 'school' },
    });
    assert.equal(way?.name, 'school');
    assert.equal(way?.lat, 38);
  });

  it('dedupes and caps results', () => {
    const places = placesFromOverpassResponse(
      {
        elements: [
          { type: 'node', id: 1, lat: 1, lon: 1, tags: { name: 'A' } },
          { type: 'node', id: 1, lat: 1, lon: 1, tags: { name: 'A' } },
          { type: 'node', id: 2, lat: 2, lon: 2, tags: { name: 'B' } },
          { type: 'node', id: 3, lat: 3, lon: 3, tags: { name: 'C' } },
        ],
      },
      2
    );
    assert.equal(places.length, 2);
    assert.equal(places[0].name, 'A');
    assert.equal(places[1].name, 'B');
  });
});

describe('queryOverpassPlaces', () => {
  it('validates inputs', async () => {
    const bad = await queryOverpassPlaces({
      lat: 91,
      lng: 0,
      radiusMiles: 3,
    });
    assert.equal(bad.ok, false);
    assert.equal(bad.status, 400);

    const badR = await queryOverpassPlaces({
      lat: 0,
      lng: 0,
      radiusMiles: 0,
    });
    assert.equal(badR.ok, false);
  });

  it('posts QL and returns places', async () => {
    /** @type {RequestInit | undefined} */
    let seenInit;
    const result = await queryOverpassPlaces({
      lat: 37.8,
      lng: -121.7,
      radiusMiles: 3,
      limit: 5,
      fetchFn: async (_url, init) => {
        seenInit = init;
        return /** @type {Response} */ ({
          ok: true,
          async json() {
            return {
              elements: [
                {
                  type: 'node',
                  id: 99,
                  lat: 37.81,
                  lon: -121.71,
                  tags: { name: 'Substation', power: 'substation' },
                },
              ],
            };
          },
        });
      },
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.places.length, 1);
    assert.equal(result.places[0].name, 'Substation');
    assert.equal(result.queryRadiusMiles, 3);
    assert.equal(seenInit?.method, 'POST');
    assert.match(String(seenInit?.body), /data=/);
  });

  it('caps query radius at 25 miles', async () => {
    const result = await queryOverpassPlaces({
      lat: 1,
      lng: 2,
      radiusMiles: 40,
      fetchFn: async () =>
        /** @type {Response} */ ({
          ok: true,
          async json() {
            return { elements: [] };
          },
        }),
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.queryRadiusMiles, 25);
  });
});
