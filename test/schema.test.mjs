import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SCHEMA_VERSION,
  buildTargetFile,
  exportCenterSource,
  rowsFromSelectedDots,
  targetIdAt,
  validateTargetFile,
  validateTargetingRow,
  validateTargetingRows,
} from '../public/js/schema.js';
import { buildTargetsFilename } from '../public/js/download.js';

/** @param {Record<string, unknown>} [overrides] */
function completeRow(overrides = {}) {
  return {
    id: 't-01',
    name: 'North ridge',
    lat: 37.82,
    lng: -121.7,
    confidence: 4,
    priority: 'high',
    ...overrides,
  };
}

describe('exportCenterSource / targetIdAt', () => {
  it('maps default center source to latlng for export', () => {
    assert.equal(exportCenterSource('default'), 'latlng');
    assert.equal(exportCenterSource('address'), 'address');
    assert.equal(exportCenterSource('click'), 'click');
  });

  it('formats stable t-NN ids', () => {
    assert.equal(targetIdAt(0), 't-01');
    assert.equal(targetIdAt(11), 't-12');
  });
});

describe('rowsFromSelectedDots', () => {
  it('keeps only selected dots and assigns t-ids plus candidateId', () => {
    const rows = rowsFromSelectedDots([
      { id: 'd-01', lat: 1, lng: 2, selected: false },
      { id: 'd-02', lat: 3, lng: 4, selected: true },
      { id: 'd-03', lat: 5, lng: 6, selected: true },
    ]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].id, 't-01');
    assert.equal(rows[0].candidateId, 'd-02');
    assert.equal(rows[0].name, '');
    assert.equal(rows[0].confidence, null);
    assert.equal(rows[0].priority, '');
    assert.equal(rows[1].id, 't-02');
    assert.equal(rows[1].lat, 5);
  });
});

describe('validateTargetingRow / validateTargetingRows', () => {
  it('requires name, confidence 1-5, and priority enum', () => {
    assert.equal(validateTargetingRow(completeRow()).ok, true);
    assert.equal(validateTargetingRow(completeRow({ name: '  ' })).ok, false);
    assert.equal(validateTargetingRow(completeRow({ confidence: null })).ok, false);
    assert.equal(validateTargetingRow(completeRow({ confidence: 6 })).ok, false);
    assert.equal(validateTargetingRow(completeRow({ priority: 'urgent' })).ok, false);
  });

  it('enforces exact required length', () => {
    const result = validateTargetingRows([completeRow()], 2);
    assert.equal(result.ok, false);
    assert.match(result.message, /Expected 2/);
  });
});

describe('buildTargetFile', () => {
  it('builds a schema-valid document with seed null', () => {
    const rows = [
      completeRow({ id: 't-01', name: 'A', lat: 37.1, lng: -121.1 }),
      completeRow({
        id: 't-02',
        name: 'B',
        lat: 37.2,
        lng: -121.2,
        confidence: 2,
        priority: 'low',
      }),
    ];
    const built = buildTargetFile({
      center: { lat: 37.0, lng: -121.0 },
      source: 'default',
      radiusMiles: 3,
      dotCount: 25,
      requiredSelections: 2,
      rows,
      createdAt: '2026-07-13T18:00:00.000Z',
    });

    assert.equal(built.ok, true);
    if (!built.ok) return;

    assert.equal(built.document.version, SCHEMA_VERSION);
    assert.equal(built.document.center.source, 'latlng');
    assert.equal(built.document.generation.seed, null);
    assert.equal(built.document.targets.length, 2);
    assert.equal(built.document.targets[0].name, 'A');

    const roundTrip = validateTargetFile(built.document);
    assert.equal(roundTrip.ok, true);
  });

  it('blocks incomplete annotation rows', () => {
    const built = buildTargetFile({
      center: { lat: 37.0, lng: -121.0 },
      source: 'click',
      radiusMiles: 3,
      dotCount: 25,
      requiredSelections: 1,
      rows: [completeRow({ name: '' })],
    });
    assert.equal(built.ok, false);
  });
});

describe('validateTargetFile', () => {
  const valid = {
    version: '1.0',
    createdAt: '2026-07-13T18:00:00Z',
    center: { lat: 37.8, lng: -121.7, source: 'address' },
    radiusMiles: 3,
    generation: { dotCount: 25, requiredSelections: 1, seed: null },
    targets: [
      {
        id: 't-01',
        name: 'Marker',
        lat: 37.81,
        lng: -121.71,
        confidence: 3,
        priority: 'medium',
      },
    ],
  };

  it('accepts a minimal valid file and ignores unknown keys', () => {
    const result = validateTargetFile({ ...valid, extra: true });
    assert.equal(result.ok, true);
  });

  it('rejects wrong targets length with operator-friendly message', () => {
    const result = validateTargetFile({
      ...valid,
      generation: { ...valid.generation, requiredSelections: 12 },
    });
    assert.equal(result.ok, false);
    assert.match(result.message, /expected 12 targets, found 1/);
  });

  it('rejects invalid priority and confidence', () => {
    assert.equal(
      validateTargetFile({
        ...valid,
        targets: [{ ...valid.targets[0], priority: 'urgent' }],
      }).ok,
      false
    );
    assert.equal(
      validateTargetFile({
        ...valid,
        targets: [{ ...valid.targets[0], confidence: 0 }],
      }).ok,
      false
    );
  });

  it('rejects duplicate target ids', () => {
    const result = validateTargetFile({
      ...valid,
      generation: { ...valid.generation, requiredSelections: 2 },
      targets: [
        valid.targets[0],
        { ...valid.targets[0], name: 'Other' },
      ],
    });
    assert.equal(result.ok, false);
    assert.match(result.message, /Duplicate/);
  });
});

describe('buildTargetsFilename', () => {
  it('uses a stable mq9-targets prefix and Zulu timestamp', () => {
    const name = buildTargetsFilename(new Date('2026-07-13T18:42:05.123Z'));
    assert.equal(name, 'mq9-targets-2026-07-13T184205Z.json');
  });
});
