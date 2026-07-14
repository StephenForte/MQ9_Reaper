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

/**
 * @param {number} currentSelected
 * @param {number} max
 * @param {boolean} currentlySelected
 * @param {{ blockExtraSelections?: boolean }} [opts]
 * @returns {boolean} whether selecting this unselected target is allowed
 */
export function canSelectDot(
  currentSelected,
  max,
  currentlySelected,
  opts = {}
) {
  if (currentlySelected) return true;
  const blockExtra = opts.blockExtraSelections !== false;
  if (blockExtra && currentSelected >= max) return false;
  return true;
}

/**
 * Toggle selection on a candidate by id. Returns a new array (immutable).
 * When blockExtraSelections is true (default), blocks selecting above max.
 *
 * @param {CandidateDot[]} dots
 * @param {string} id
 * @param {{ maxSelections: number, blockExtraSelections?: boolean }} opts
 * @returns {{ dots: CandidateDot[], changed: boolean, blocked: boolean }}
 */
export function toggleDotSelection(dots, id, opts) {
  const index = dots.findIndex((dot) => dot.id === id);
  if (index < 0) {
    return { dots, changed: false, blocked: false };
  }

  const target = dots[index];
  const count = selectedCount(dots);
  if (
    !canSelectDot(count, opts.maxSelections, target.selected, {
      blockExtraSelections: opts.blockExtraSelections,
    })
  ) {
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

/**
 * Append a custom candidate at a map click. Auto-selects when under the max.
 *
 * @param {CandidateDot[]} dots
 * @param {{ lat: number, lng: number, id?: string }} point
 * @param {{ maxSelections: number, blockExtraSelections?: boolean }} opts
 * @returns {{ dots: CandidateDot[], added: CandidateDot }}
 */
export function addCustomCandidate(dots, point, opts) {
  const count = selectedCount(dots);
  const selected = canSelectDot(count, opts.maxSelections, false, {
    blockExtraSelections: opts.blockExtraSelections,
  });
  const customCount = dots.filter((dot) =>
    String(dot.id).startsWith('custom-')
  ).length;
  const added = {
    id: point.id || `custom-${customCount + 1}`,
    lat: point.lat,
    lng: point.lng,
    selected,
  };
  return { dots: [...dots, added], added };
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
