/**
 * Pure selection helpers (P2) — kept free of DOM / Maps for unit tests.
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
 * @param {number} required
 * @returns {boolean}
 */
export function isExactSelection(dots, required) {
  return selectedCount(dots) === required;
}

/**
 * @param {number} currentSelected
 * @param {number} required
 * @param {boolean} blockExtra
 * @param {boolean} currentlySelected
 * @returns {boolean} whether selecting this unselected dot is allowed
 */
export function canSelectDot(
  currentSelected,
  required,
  blockExtra,
  currentlySelected
) {
  if (currentlySelected) return true;
  if (!blockExtra && currentSelected >= required) return true;
  if (blockExtra && currentSelected >= required) return false;
  return true;
}

/**
 * Toggle selection on a dot by id. Returns a new array (immutable).
 * When blocked by exact-N gate, returns the same dots reference.
 *
 * @param {CandidateDot[]} dots
 * @param {string} id
 * @param {{ requiredSelections: number, blockExtraSelections: boolean }} opts
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
    !canSelectDot(
      count,
      opts.requiredSelections,
      opts.blockExtraSelections,
      target.selected
    )
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
