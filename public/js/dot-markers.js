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

/** Annotate-list focus: larger gold + halo so the active target reads on the map. */
const ACTIVE = {
  fill: '#dbb86a',
  stroke: '#fff8e7',
  r: 9,
  ringR: 14,
  ringStroke: 'rgba(219, 184, 106, 0.85)',
};

/** Distinct from candidate dots — gold diamond for Review saved targets. */
const SAVED = {
  fill: '#d4a017',
  stroke: '#f5e6c8',
  size: 18,
};

/**
 * @param {{ fill: string, stroke: string, r: number, ringR?: number, ringStroke?: string }} style
 * @returns {string}
 */
function circleSvgDataUrl(style) {
  const outer = style.ringR ?? style.r;
  const size = outer * 2 + 4;
  const c = size / 2;
  const ring =
    style.ringR != null
      ? `<circle cx="${c}" cy="${c}" r="${style.ringR}" fill="none" stroke="${style.ringStroke}" stroke-width="2"/>`
      : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${ring}<circle cx="${c}" cy="${c}" r="${style.r}" fill="${style.fill}" stroke="${style.stroke}" stroke-width="1.5"/></svg>`;
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
const ACTIVE_URL = circleSvgDataUrl(ACTIVE);
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
export function activeDotIconUrl() {
  return ACTIVE_URL;
}

/** @returns {string} */
export function savedTargetIconUrl() {
  return SAVED_URL;
}

/**
 * @param {boolean} selected
 * @param {{ active?: boolean }} [opts]
 * @returns {google.maps.Icon}
 */
export function iconForDot(selected, opts = {}) {
  const active = Boolean(opts.active) && selected;
  const style = active ? ACTIVE : selected ? SELECTED : UNSELECTED;
  const outer = style.ringR ?? style.r;
  const size = outer * 2 + 4;
  const url = active ? ACTIVE_URL : selected ? SELECTED_URL : UNSELECTED_URL;
  return {
    url,
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
