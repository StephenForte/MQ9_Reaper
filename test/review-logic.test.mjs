import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildTargetFile } from '../public/js/schema.js';
import {
  MALFORMED_JSON_MESSAGE,
  formatConfidenceLabel,
  formatPriorityLabel,
  formatReviewMeta,
  parseTargetFileJson,
  targetInfoLines,
} from '../public/js/review-logic.js';

function validDoc(overrides = {}) {
  return {
    version: '1.0',
    createdAt: '2026-07-14T12:00:00Z',
    center: { lat: 37.8, lng: -121.7, source: 'address' },
    radiusMiles: 3,
    generation: { dotCount: 25, requiredSelections: 1, seed: null },
    targets: [
      {
        id: 't-01',
        name: 'North ridge',
        lat: 37.81,
        lng: -121.71,
        confidence: 4,
        priority: 'high',
      },
    ],
    ...overrides,
  };
}

describe('parseTargetFileJson', () => {
  it('returns the §8.3 malformed-JSON message', () => {
    const result = parseTargetFileJson('{ not json');
    assert.equal(result.ok, false);
    assert.equal(result.message, MALFORMED_JSON_MESSAGE);
    assert.equal(result.message, "This file isn't valid JSON.");
  });

  it('rejects schema-invalid JSON without rendering payload', () => {
    const result = parseTargetFileJson('{}');
    assert.equal(result.ok, false);
    assert.match(result.message, /version|Unsupported/i);
  });

  it('accepts a valid file and ignores unknown keys', () => {
    const result = parseTargetFileJson(
      JSON.stringify({ ...validDoc(), extraField: true })
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.document.targets.length, 1);
    assert.equal(result.document.targets[0].name, 'North ridge');
  });

  it('round-trips a P3 buildTargetFile document', () => {
    const built = buildTargetFile({
      center: { lat: 37.0, lng: -121.0 },
      source: 'click',
      radiusMiles: 2.5,
      dotCount: 25,
      minSelections: 1,
      maxSelections: 12,
      seed: null,
      createdAt: '2026-07-14T18:00:00.000Z',
      rows: [
        {
          id: 't-01',
          name: 'Alpha',
          lat: 37.01,
          lng: -121.01,
          confidence: 3,
          priority: 'medium',
        },
        {
          id: 't-02',
          name: 'Bravo',
          lat: 37.02,
          lng: -121.02,
          confidence: 5,
          priority: 'critical',
        },
      ],
    });
    assert.equal(built.ok, true);
    if (!built.ok) return;

    const parsed = parseTargetFileJson(JSON.stringify(built.document));
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.document.generation.requiredSelections, 2);
    assert.equal(parsed.document.targets.length, 2);
    assert.equal(parsed.document.center.source, 'click');
  });

  it('surfaces expected targets length mismatches', () => {
    const bad = validDoc({
      generation: { dotCount: 25, requiredSelections: 12, seed: null },
    });
    const result = parseTargetFileJson(JSON.stringify(bad));
    assert.equal(result.ok, false);
    assert.match(result.message, /expected 12 targets, found 1/);
  });

  it('rejects unsupported version and missing center', () => {
    assert.match(
      parseTargetFileJson(JSON.stringify(validDoc({ version: '2.0' }))).message ||
        '',
      /Unsupported version/
    );
    const noCenter = validDoc();
    delete noCenter.center;
    assert.match(
      parseTargetFileJson(JSON.stringify(noCenter)).message || '',
      /center/
    );
  });
});

describe('review display helpers', () => {
  it('formats confidence and priority for operators', () => {
    assert.equal(formatConfidenceLabel(4), '4 / 5');
    assert.equal(formatPriorityLabel('critical'), 'Critical');
    assert.equal(formatPriorityLabel('low'), 'Low');
  });

  it('builds InfoWindow lines from target fields', () => {
    assert.deepEqual(
      targetInfoLines({
        name: 'Reservoir edge',
        confidence: 3,
        priority: 'medium',
      }),
      [
        'Reservoir edge',
        'Confidence: 3 / 5',
        'Priority: Medium',
      ]
    );
  });

  it('formats side-panel metadata from a loaded file', () => {
    const meta = formatReviewMeta(validDoc(), 'demo-targets.json');
    assert.equal(meta.filename, 'demo-targets.json');
    assert.equal(meta.createdAt, '2026-07-14T12:00:00Z');
    assert.equal(meta.center, '37.8000, -121.7000');
    assert.equal(meta.source, 'Address');
    assert.equal(meta.radius, '3 mi');
    assert.equal(meta.targetCount, '1');
  });
});
