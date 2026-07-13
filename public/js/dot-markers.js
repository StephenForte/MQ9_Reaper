/**
 * Candidate-dot marker icons (P2). SVG data URLs keep Maps Marker styling local.
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

const UNSELECTED_URL = circleSvgDataUrl(UNSELECTED);
const SELECTED_URL = circleSvgDataUrl(SELECTED);

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
