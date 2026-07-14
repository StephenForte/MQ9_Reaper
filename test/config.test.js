import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseFrontmatter, toAppConfig, loadAppConfig } from '../config.js';

describe('parseFrontmatter', () => {
  it('reads flat key/value pairs', () => {
    const raw = parseFrontmatter('---\nradiusMiles: 3\nmapType: hybrid\n---\n\n# note\n');
    assert.equal(raw.radiusMiles, '3');
    assert.equal(raw.mapType, 'hybrid');
  });
});

describe('toAppConfig', () => {
  const base = {
    radiusMiles: '3',
    dotCount: '25',
    minSelections: '1',
    maxSelections: '12',
    minDotSpacingMeters: '50',
    mapType: 'hybrid',
    radiusUnit: 'miles',
    confirmOnRecenter: 'true',
    seededRng: 'false',
    defaultCenterLat: '37.7996',
    defaultCenterLng: '-121.7124',
  };

  it('parses min/max selection defaults', () => {
    const cfg = toAppConfig(base);
    assert.equal(cfg.dotCount, 25);
    assert.equal(cfg.minSelections, 1);
    assert.equal(cfg.maxSelections, 12);
    assert.equal(cfg.minDotSpacingMeters, 50);
    assert.equal(cfg.confirmOnRecenter, true);
  });

  it('rejects maxSelections >= dotCount', () => {
    assert.throws(
      () => toAppConfig({ ...base, maxSelections: '25', dotCount: '25' }),
      /maxSelections must be < dotCount/
    );
  });

  it('rejects minSelections > maxSelections', () => {
    assert.throws(
      () => toAppConfig({ ...base, minSelections: '8', maxSelections: '4' }),
      /minSelections must be <= maxSelections/
    );
  });

  it('falls back from legacy requiredSelections to maxSelections', () => {
    const { minSelections: _m, maxSelections: _x, ...legacy } = base;
    const cfg = toAppConfig({ ...legacy, requiredSelections: '10' });
    assert.equal(cfg.minSelections, 1);
    assert.equal(cfg.maxSelections, 10);
  });
});

describe('loadAppConfig', () => {
  it('loads the repo app-config.md', () => {
    const cfg = loadAppConfig();
    assert.ok(cfg.maxSelections < cfg.dotCount);
    assert.ok(cfg.minSelections <= cfg.maxSelections);
    assert.equal(cfg.radiusUnit, 'miles');
  });
});
