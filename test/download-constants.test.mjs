import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildTargetsFilename } from '../public/js/download.js';
import {
  METERS_PER_DEG_LAT,
  METERS_PER_MILE,
  MAPS_SCRIPT_ID,
} from '../public/js/constants.js';

describe('constants', () => {
  it('matches PRD meters conversions', () => {
    assert.equal(METERS_PER_MILE, 1609.344);
    assert.equal(METERS_PER_DEG_LAT, 111320);
    assert.equal(MAPS_SCRIPT_ID, 'google-maps-js');
  });
});

describe('buildTargetsFilename', () => {
  it('uses a stable mq9-targets prefix and Zulu timestamp without colons', () => {
    const name = buildTargetsFilename(new Date('2026-07-11T18:42:05.123Z'));
    assert.equal(name, 'mq9-targets-2026-07-11T184205Z.json');
  });
});
