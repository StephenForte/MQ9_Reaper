import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  collectValidatedTargeting,
  isTargetingSelectionStale,
  targetingExportGate,
} from '../public/js/targeting-logic.js';

/** @returns {import('../public/js/schema.js').TargetingRow} */
function row(overrides = {}) {
  return {
    id: 't-01',
    name: 'North ridge',
    lat: 37.81,
    lng: -121.71,
    confidence: 3,
    priority: 'medium',
    candidateId: 'c-01',
    ...overrides,
  };
}

describe('isTargetingSelectionStale', () => {
  it('is false when selected ids match the snapshot order', () => {
    const candidates = [
      { id: 'a', selected: true },
      { id: 'b', selected: false },
      { id: 'c', selected: true },
    ];
    assert.equal(isTargetingSelectionStale(candidates, ['a', 'c']), false);
  });

  it('is true when selection changes or reorders', () => {
    const candidates = [
      { id: 'a', selected: true },
      { id: 'c', selected: true },
    ];
    assert.equal(isTargetingSelectionStale(candidates, ['a', 'b']), true);
    assert.equal(isTargetingSelectionStale(candidates, ['c', 'a']), true);
    assert.equal(isTargetingSelectionStale([], ['a']), true);
  });
});

describe('targetingExportGate', () => {
  it('blocks when hidden, stale, or empty', () => {
    assert.deepEqual(
      targetingExportGate({
        visible: false,
        stale: false,
        rows: [row()],
        title: 'Pkg',
        category: 'ops',
      }),
      { ready: false, title: 'Complete the targeting list first' }
    );
    assert.deepEqual(
      targetingExportGate({
        visible: true,
        stale: true,
        rows: [row()],
        title: 'Pkg',
        category: 'ops',
      }),
      { ready: false, title: 'Selection changed — save targets again' }
    );
    assert.deepEqual(
      targetingExportGate({
        visible: true,
        stale: false,
        rows: [],
        title: 'Pkg',
        category: 'ops',
      }),
      { ready: false, title: 'Complete the targeting list first' }
    );
  });

  it('requires meta and complete rows before ready', () => {
    assert.equal(
      targetingExportGate({
        visible: true,
        stale: false,
        rows: [row()],
        title: '',
        category: 'ops',
      }).ready,
      false
    );
    assert.match(
      targetingExportGate({
        visible: true,
        stale: false,
        rows: [row()],
        title: '',
        category: 'ops',
      }).title,
      /title and category/i
    );
    assert.match(
      targetingExportGate({
        visible: true,
        stale: false,
        rows: [row({ name: '' })],
        title: 'Pkg',
        category: 'ops',
      }).title,
      /name, confidence, and priority/i
    );
    assert.deepEqual(
      targetingExportGate({
        visible: true,
        stale: false,
        rows: [row()],
        title: 'Pkg',
        category: 'ops',
      }),
      { ready: true, title: '' }
    );
  });
});

describe('collectValidatedTargeting', () => {
  it('requires a visible non-stale list', () => {
    assert.equal(
      collectValidatedTargeting({
        visible: false,
        stale: false,
        rows: [row()],
        title: 'Pkg',
        category: 'ops',
        minSelections: 1,
        maxSelections: 12,
      }).ok,
      false
    );
    assert.match(
      collectValidatedTargeting({
        visible: true,
        stale: true,
        rows: [row()],
        title: 'Pkg',
        category: 'ops',
        minSelections: 1,
        maxSelections: 12,
      }).message,
      /Save Targets again/i
    );
  });

  it('enforces min/max and per-row annotation', () => {
    const under = collectValidatedTargeting({
      visible: true,
      stale: false,
      rows: [],
      title: 'Pkg',
      category: 'ops',
      minSelections: 1,
      maxSelections: 12,
    });
    assert.equal(under.ok, false);
    assert.match(under.message, /between 1 and 12/);

    const badRow = collectValidatedTargeting({
      visible: true,
      stale: false,
      rows: [row({ confidence: null })],
      title: 'Pkg',
      category: 'ops',
      minSelections: 1,
      maxSelections: 12,
    });
    assert.equal(badRow.ok, false);
    assert.equal(badRow.rowIndex, 0);
    assert.equal(badRow.field, 'confidence');
  });

  it('returns trimmed rows when valid', () => {
    const result = collectValidatedTargeting({
      visible: true,
      stale: false,
      rows: [row({ name: '  Alpha  ' }), row({ id: 't-02', candidateId: 'c-02' })],
      title: '  Scout  ',
      category: '  training  ',
      minSelections: 1,
      maxSelections: 12,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.title, 'Scout');
    assert.equal(result.category, 'training');
    assert.equal(result.rows[0].name, 'Alpha');
    assert.equal(result.rows.length, 2);
  });
});
