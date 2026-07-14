import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canSelectDot,
  getSelectedDots,
  isExactSelection,
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

describe('selectedCount / isExactSelection', () => {
  it('counts selected dots', () => {
    const dots = dotsFrom([{ selected: true }, { selected: false }, { selected: true }]);
    assert.equal(selectedCount(dots), 2);
    assert.equal(isExactSelection(dots, 2), true);
    assert.equal(isExactSelection(dots, 3), false);
  });
});

describe('getSelectedDots / selectedIds', () => {
  it('returns selected dots and ids in array order', () => {
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

describe('canSelectDot / blockExtraSelections', () => {
  it('always allows deselect', () => {
    assert.equal(canSelectDot(12, 12, true, true), true);
  });

  it('blocks selecting above N when blockExtra is true', () => {
    assert.equal(canSelectDot(12, 12, true, false), false);
  });

  it('allows selecting above N when blockExtra is false', () => {
    assert.equal(canSelectDot(12, 12, false, false), true);
  });
});

describe('toggleDotSelection', () => {
  it('selects and deselects by id', () => {
    const dots = dotsFrom([{ selected: false }, { selected: false }]);
    const selected = toggleDotSelection(dots, 'd-01', {
      requiredSelections: 1,
      blockExtraSelections: true,
    });
    assert.equal(selected.changed, true);
    assert.equal(selected.dots[0].selected, true);

    const deselected = toggleDotSelection(selected.dots, 'd-01', {
      requiredSelections: 1,
      blockExtraSelections: true,
    });
    assert.equal(deselected.dots[0].selected, false);
  });

  it('blocks extra selection when configured', () => {
    const dots = dotsFrom([{ selected: true }, { selected: false }]);
    const result = toggleDotSelection(dots, 'd-02', {
      requiredSelections: 1,
      blockExtraSelections: true,
    });
    assert.equal(result.blocked, true);
    assert.equal(result.changed, false);
    assert.equal(result.dots, dots);
  });

  it('allows extras when blockExtraSelections is false', () => {
    const dots = dotsFrom([{ selected: true }, { selected: false }]);
    const result = toggleDotSelection(dots, 'd-02', {
      requiredSelections: 1,
      blockExtraSelections: false,
    });
    assert.equal(result.blocked, false);
    assert.equal(result.changed, true);
    assert.equal(selectedCount(result.dots), 2);
    assert.equal(isExactSelection(result.dots, 1), false);
  });
});

describe('willLoseSelection', () => {
  it('is true only when at least one dot is selected', () => {
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
