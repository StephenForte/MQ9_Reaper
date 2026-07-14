/**
 * Pure selection helpers — kept free of DOM / Maps for unit tests.
 */

/**
 * @typedef {{ id: string, lat: number, lng: number, selected: boolean }} CandidateDot
 */

/**
 * @param {CandidateDot[]} dots
 * @returns {number}
 */
export function selectedCount(dots) {
  return dots.reduce((n, dot) => n + (dot.selected ? 1 : 0), 0);
}

/**
 * @param {CandidateDot[]} dots
 * @returns {CandidateDot[]}
 */
export function getSelectedDots(dots) {
  return dots.filter((dot) => dot.selected);
}

/**
 * Ordered ids of currently selected dots (stable map order).
 * @param {CandidateDot[]} dots
 * @returns {string[]}
 */
export function selectedIds(dots) {
  return getSelectedDots(dots).map((dot) => dot.id);
}

/**
 * Valid shortlist: at least min, at most max.
 * @param {CandidateDot[]} dots
 * @param {number} min
 * @param {number} max
 * @returns {boolean}
 */
export function isValidSelection(dots, min, max) {
  const count = selectedCount(dots);
  return count >= min && count <= max;
}

/** @deprecated Prefer isValidSelection — kept for older tests during transition. */
export function isExactSelection(dots, required) {
  return selectedCount(dots) === required;
}

/**
 * @param {number} currentSelected
 * @param {number} max
 * @param {boolean} currentlySelected
 * @returns {boolean} whether selecting this unselected target is allowed
 */
export function canSelectDot(currentSelected, max, currentlySelected) {
  if (currentlySelected) return true;
  if (currentSelected >= max) return false;
  return true;
}

/**
 * Toggle selection on a candidate by id. Returns a new array (immutable).
 * Blocks selecting above maxSelections.
 *
 * @param {CandidateDot[]} dots
 * @param {string} id
 * @param {{ maxSelections: number }} opts
 * @returns {{ dots: CandidateDot[], changed: boolean, blocked: boolean }}
 */
export function toggleDotSelection(dots, id, opts) {
  const index = dots.findIndex((dot) => dot.id === id);
  if (index < 0) {
    return { dots, changed: false, blocked: false };
  }

  const target = dots[index];
  const count = selectedCount(dots);
  if (!canSelectDot(count, opts.maxSelections, target.selected)) {
    return { dots, changed: false, blocked: true };
  }

  const next = dots.map((dot, i) =>
    i === index ? { ...dot, selected: !dot.selected } : dot
  );
  return { dots: next, changed: true, blocked: false };
}

/**
 * Work worth confirming before recenter / regenerate (decision: ≥1 selected).
 * @param {CandidateDot[]} dots
 * @returns {boolean}
 */
export function willLoseSelection(dots) {
  return selectedCount(dots) > 0;
}

/** @type {Record<string, string>} */
export const CENTER_SOURCE_LABELS = {
  default: 'Default',
  address: 'Address',
  click: 'Map click',
  latlng: 'Lat / long',
};

/**
 * @param {string} source
 * @returns {string}
 */
export function labelForCenterSource(source) {
  return CENTER_SOURCE_LABELS[source] || source;
}
