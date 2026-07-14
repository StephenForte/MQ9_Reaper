import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canSelectDot,
  getSelectedDots,
  isValidSelection,
  labelForCenterSource,
  selectedCount,
  selectedIds,
  toggleDotSelection,
  willLoseSelection,
} from '../public/js/selection-logic.js';

/** @param {Partial<{ id: string, selected: boolean }>[]} rows */
function dotsFrom(rows) {
  return rows.map((row, i) => ({
    id: row.id || `d-${String(i + 1).padStart(2, '0')}`,
    lat: 0,
    lng: 0,
    selected: Boolean(row.selected),
  }));
}

describe('selectedCount / isValidSelection', () => {
  it('counts selected targets and validates min/max range', () => {
    const dots = dotsFrom([{ selected: true }, { selected: false }, { selected: true }]);
    assert.equal(selectedCount(dots), 2);
    assert.equal(isValidSelection(dots, 1, 12), true);
    assert.equal(isValidSelection(dots, 3, 12), false);
    assert.equal(isValidSelection(dotsFrom([]), 1, 12), false);
  });
});

describe('getSelectedDots / selectedIds', () => {
  it('returns selected targets and ids in array order', () => {
    const dots = dotsFrom([
      { id: 'd-01', selected: false },
      { id: 'd-02', selected: true },
      { id: 'd-03', selected: true },
    ]);
    assert.deepEqual(
      getSelectedDots(dots).map((d) => d.id),
      ['d-02', 'd-03']
    );
    assert.deepEqual(selectedIds(dots), ['d-02', 'd-03']);
  });
});

describe('canSelectDot / maxSelections', () => {
  it('always allows deselect', () => {
    assert.equal(canSelectDot(12, 12, true), true);
  });

  it('blocks selecting above max', () => {
    assert.equal(canSelectDot(12, 12, false), false);
  });

  it('allows selecting below max', () => {
    assert.equal(canSelectDot(11, 12, false), true);
  });
});

describe('toggleDotSelection', () => {
  it('selects and deselects by id', () => {
    const dots = dotsFrom([{ selected: false }, { selected: false }]);
    const selected = toggleDotSelection(dots, 'd-01', { maxSelections: 1 });
    assert.equal(selected.changed, true);
    assert.equal(selected.dots[0].selected, true);

    const deselected = toggleDotSelection(selected.dots, 'd-01', {
      maxSelections: 1,
    });
    assert.equal(deselected.dots[0].selected, false);
  });

  it('blocks extra selection at max', () => {
    const dots = dotsFrom([{ selected: true }, { selected: false }]);
    const result = toggleDotSelection(dots, 'd-02', { maxSelections: 1 });
    assert.equal(result.blocked, true);
    assert.equal(result.changed, false);
    assert.equal(result.dots, dots);
  });
});

describe('willLoseSelection', () => {
  it('is true only when at least one target is selected', () => {
    assert.equal(willLoseSelection(dotsFrom([{ selected: false }])), false);
    assert.equal(willLoseSelection(dotsFrom([{ selected: true }])), true);
    assert.equal(willLoseSelection([]), false);
  });
});

describe('labelForCenterSource', () => {
  it('maps known sources to operator labels', () => {
    assert.equal(labelForCenterSource('click'), 'Map click');
    assert.equal(labelForCenterSource('latlng'), 'Lat / long');
    assert.equal(labelForCenterSource('address'), 'Address');
    assert.equal(labelForCenterSource('default'), 'Default');
  });
});
