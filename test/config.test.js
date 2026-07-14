import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseFrontmatter, toAppConfig, loadAppConfig } from '../config.js';

describe('parseFrontmatter', () => {
  it('reads flat key/value pairs', () => {
    const raw = parseFrontmatter('---\nradiusMiles: 3\nmapType: hybrid\n---\n\n# note\n');
    assert.equal(raw.radiusMiles, '3');
    assert.equal(raw.mapType, 'hybrid');
  });

  it('throws a clear message when frontmatter is missing', () => {
    assert.throws(
      () => parseFrontmatter('# no frontmatter\n'),
      /Missing YAML frontmatter in config\/app-config\.md/
    );
  });

  it('skips comments and blank lines', () => {
    const raw = parseFrontmatter(
      '---\n# comment\n\nradiusMiles: 4\n---\n'
    );
    assert.equal(raw.radiusMiles, '4');
  });
});

describe('toAppConfig', () => {
  const base = {
    radiusMiles: '3',
    dotCount: '25',
    minSelections: '1',
    maxSelections: '12',
    blockExtraSelections: 'true',
    minDotSpacingMeters: '50',
    mapType: 'hybrid',
    radiusUnit: 'miles',
    confirmOnRecenter: 'true',
    seededRng: 'false',
    defaultCenterLat: '37.7996',
    defaultCenterLng: '-121.7124',
  };

  it('parses min/max selection defaults and blockExtraSelections', () => {
    const cfg = toAppConfig(base);
    assert.equal(cfg.dotCount, 25);
    assert.equal(cfg.minSelections, 1);
    assert.equal(cfg.maxSelections, 12);
    assert.equal(cfg.blockExtraSelections, true);
    assert.equal(cfg.minDotSpacingMeters, 50);
    assert.equal(cfg.confirmOnRecenter, true);
  });

  it('defaults blockExtraSelections to true when omitted', () => {
    const { blockExtraSelections: _b, ...rest } = base;
    const cfg = toAppConfig(rest);
    assert.equal(cfg.blockExtraSelections, true);
  });

  it('parses blockExtraSelections false', () => {
    const cfg = toAppConfig({ ...base, blockExtraSelections: 'false' });
    assert.equal(cfg.blockExtraSelections, false);
  });

  it('rejects maxSelections >= dotCount with field-aware message', () => {
    assert.throws(
      () => toAppConfig({ ...base, maxSelections: '25', dotCount: '25' }),
      /invalid "maxSelections".*must be < dotCount/
    );
  });

  it('rejects minSelections > maxSelections', () => {
    assert.throws(
      () => toAppConfig({ ...base, minSelections: '8', maxSelections: '4' }),
      /invalid "minSelections".*must be <= maxSelections/
    );
  });

  it('rejects missing required keys', () => {
    const { radiusMiles: _r, ...rest } = base;
    assert.throws(
      () => toAppConfig(rest),
      /invalid "radiusMiles".*missing/
    );
  });

  it('rejects out-of-range default center', () => {
    assert.throws(
      () => toAppConfig({ ...base, defaultCenterLat: '91' }),
      /invalid "defaultCenterLat".*between -90 and 90/
    );
    assert.throws(
      () => toAppConfig({ ...base, defaultCenterLng: '-181' }),
      /invalid "defaultCenterLng".*between -180 and 180/
    );
  });

  it('rejects invalid mapType', () => {
    assert.throws(
      () => toAppConfig({ ...base, mapType: 'terrain' }),
      /invalid "mapType".*hybrid" or "satellite/
    );
  });

  it('rejects radiusUnit other than miles', () => {
    assert.throws(
      () => toAppConfig({ ...base, radiusUnit: 'km' }),
      /invalid "radiusUnit".*miles/
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
    assert.equal(cfg.blockExtraSelections, true);
  });
});
