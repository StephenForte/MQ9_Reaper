/**
 * Marker icons (P2 candidates / P4 saved targets). SVG data URLs keep styling local.
 */

const UNSELECTED = {
  fill: '#8b9aab',
  stroke: '#e8eef4',
  r: 6,
};

const SELECTED = {
  fill: '#c4a35a',
  stroke: '#f5e6c8',
  r: 7,
};

/** Distinct from candidate dots — gold diamond for Review saved targets. */
const SAVED = {
  fill: '#d4a017',
  stroke: '#f5e6c8',
  size: 18,
};

/**
 * @param {{ fill: string, stroke: string, r: number }} style
 * @returns {string}
 */
function circleSvgDataUrl(style) {
  const size = style.r * 2 + 4;
  const c = size / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${c}" cy="${c}" r="${style.r}" fill="${style.fill}" stroke="${style.stroke}" stroke-width="1.5"/></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

/**
 * @param {{ fill: string, stroke: string, size: number }} style
 * @returns {string}
 */
function diamondSvgDataUrl(style) {
  const s = style.size;
  const mid = s / 2;
  const inset = 2.5;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}"><polygon points="${mid},${inset} ${s - inset},${mid} ${mid},${s - inset} ${inset},${mid}" fill="${style.fill}" stroke="${style.stroke}" stroke-width="1.5"/></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

const UNSELECTED_URL = circleSvgDataUrl(UNSELECTED);
const SELECTED_URL = circleSvgDataUrl(SELECTED);
const SAVED_URL = diamondSvgDataUrl(SAVED);

/** @returns {string} */
export function unselectedDotIconUrl() {
  return UNSELECTED_URL;
}

/** @returns {string} */
export function selectedDotIconUrl() {
  return SELECTED_URL;
}

/** @returns {string} */
export function savedTargetIconUrl() {
  return SAVED_URL;
}

/**
 * @param {boolean} selected
 * @returns {google.maps.Icon}
 */
export function iconForDot(selected) {
  const style = selected ? SELECTED : UNSELECTED;
  const size = style.r * 2 + 4;
  return {
    url: selected ? SELECTED_URL : UNSELECTED_URL,
    scaledSize: new google.maps.Size(size, size),
    anchor: new google.maps.Point(size / 2, size / 2),
  };
}

/**
 * Saved-target marker for the Review tab (distinct from candidate dots).
 * @returns {google.maps.Icon}
 */
export function iconForSavedTarget() {
  const size = SAVED.size;
  return {
    url: SAVED_URL,
    scaledSize: new google.maps.Size(size, size),
    anchor: new google.maps.Point(size / 2, size / 2),
  };
}
