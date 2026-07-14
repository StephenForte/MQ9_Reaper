import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addCustomCandidate,
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

  it('treats over-max as invalid even when extras are allowed', () => {
    const dots = dotsFrom([
      { selected: true },
      { selected: true },
      { selected: true },
    ]);
    assert.equal(isValidSelection(dots, 1, 2), false);
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

  it('blocks selecting above max when blockExtraSelections is true', () => {
    assert.equal(canSelectDot(12, 12, false), false);
    assert.equal(
      canSelectDot(12, 12, false, { blockExtraSelections: true }),
      false
    );
  });

  it('allows selecting above max when blockExtraSelections is false', () => {
    assert.equal(
      canSelectDot(12, 12, false, { blockExtraSelections: false }),
      true
    );
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

  it('blocks extra selection at max when blockExtraSelections is true', () => {
    const dots = dotsFrom([{ selected: true }, { selected: false }]);
    const result = toggleDotSelection(dots, 'd-02', { maxSelections: 1 });
    assert.equal(result.blocked, true);
    assert.equal(result.changed, false);
    assert.equal(result.dots, dots);
  });

  it('allows extra selection when blockExtraSelections is false', () => {
    const dots = dotsFrom([{ selected: true }, { selected: false }]);
    const result = toggleDotSelection(dots, 'd-02', {
      maxSelections: 1,
      blockExtraSelections: false,
    });
    assert.equal(result.blocked, false);
    assert.equal(result.changed, true);
    assert.equal(result.dots[1].selected, true);
    assert.equal(isValidSelection(result.dots, 1, 1), false);
  });
});

describe('willLoseSelection', () => {
  it('is true only when at least one target is selected', () => {
    assert.equal(willLoseSelection(dotsFrom([{ selected: false }])), false);
    assert.equal(willLoseSelection(dotsFrom([{ selected: true }])), true);
    assert.equal(willLoseSelection([]), false);
  });
});

describe('addCustomCandidate', () => {
  it('appends a selected custom target when under max', () => {
    const dots = dotsFrom([{ selected: true }]);
    const result = addCustomCandidate(
      dots,
      { lat: 1.5, lng: 2.5 },
      { maxSelections: 12 }
    );
    assert.equal(result.dots.length, 2);
    assert.equal(result.added.id, 'custom-1');
    assert.equal(result.added.lat, 1.5);
    assert.equal(result.added.lng, 2.5);
    assert.equal(result.added.selected, true);
  });

  it('adds unselected when at max and extras are blocked', () => {
    const dots = dotsFrom([{ selected: true }]);
    const result = addCustomCandidate(
      dots,
      { lat: 0, lng: 0 },
      { maxSelections: 1, blockExtraSelections: true }
    );
    assert.equal(result.added.selected, false);
    assert.equal(result.added.id, 'custom-1');
  });

  it('increments custom ids when customs already exist', () => {
    const dots = [
      ...dotsFrom([{ selected: false }]),
      { id: 'custom-1', lat: 0, lng: 0, selected: false },
    ];
    const result = addCustomCandidate(
      dots,
      { lat: 3, lng: 4 },
      { maxSelections: 12 }
    );
    assert.equal(result.added.id, 'custom-2');
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
