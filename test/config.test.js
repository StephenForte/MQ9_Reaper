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
    requiredSelections: '12',
    blockExtraSelections: 'true',
    minDotSpacingMeters: '50',
    mapType: 'hybrid',
    radiusUnit: 'miles',
    confirmOnRecenter: 'true',
    seededRng: 'false',
    defaultCenterLat: '37.7996',
    defaultCenterLng: '-121.7124',
  };

  it('parses defaults used by P2', () => {
    const cfg = toAppConfig(base);
    assert.equal(cfg.dotCount, 25);
    assert.equal(cfg.requiredSelections, 12);
    assert.equal(cfg.blockExtraSelections, true);
    assert.equal(cfg.minDotSpacingMeters, 50);
    assert.equal(cfg.confirmOnRecenter, true);
  });

  it('rejects requiredSelections >= dotCount', () => {
    assert.throws(
      () => toAppConfig({ ...base, requiredSelections: '25', dotCount: '25' }),
      /requiredSelections must be < dotCount/
    );
  });

  it('treats blockExtraSelections false literally', () => {
    const cfg = toAppConfig({ ...base, blockExtraSelections: 'false' });
    assert.equal(cfg.blockExtraSelections, false);
  });
});

describe('loadAppConfig', () => {
  it('loads the repo app-config.md', () => {
    const cfg = loadAppConfig();
    assert.ok(cfg.requiredSelections < cfg.dotCount);
    assert.equal(cfg.radiusUnit, 'miles');
  });
});
