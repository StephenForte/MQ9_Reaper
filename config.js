const fs = require('fs');
const path = require('path');

/**
 * Loads human-editable defaults from config/app-config.md (YAML frontmatter).
 * Admin UI (PRD P6) will eventually write the same file / values.
 */

const CONFIG_MD = path.join(__dirname, 'config', 'app-config.md');

/**
 * Minimal frontmatter parser for flat `key: value` lines (no nested YAML).
 * @param {string} text
 * @returns {Record<string, string>}
 */
function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    throw new Error(`Missing YAML frontmatter in ${CONFIG_MD}`);
  }

  /** @type {Record<string, string>} */
  const raw = {};
  for (const line of match[1].split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf(':');
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    raw[key] = value;
  }
  return raw;
}

/**
 * @param {Record<string, string>} raw
 */
function toAppConfig(raw) {
  const radiusMiles = Number(raw.radiusMiles);
  const dotCount = Number(raw.dotCount);
  const requiredSelections = Number(raw.requiredSelections);
  const defaultCenterLat = Number(raw.defaultCenterLat);
  const defaultCenterLng = Number(raw.defaultCenterLng);

  const minDotSpacingMeters = Number(raw.minDotSpacingMeters);
  const mapType = raw.mapType === 'satellite' ? 'satellite' : 'hybrid';
  const radiusUnit = raw.radiusUnit === 'km' ? 'km' : 'miles';
  const blockExtraSelections = raw.blockExtraSelections !== 'false';
  const confirmOnRecenter = raw.confirmOnRecenter !== 'false';
  const seededRng = raw.seededRng === 'true';

  if (!Number.isFinite(radiusMiles) || radiusMiles <= 0) {
    throw new Error('config: radiusMiles must be a number > 0');
  }
  if (!Number.isInteger(dotCount) || dotCount < 2) {
    throw new Error('config: dotCount must be an integer >= 2');
  }
  if (!Number.isInteger(requiredSelections) || requiredSelections < 1) {
    throw new Error('config: requiredSelections must be an integer >= 1');
  }
  if (!(requiredSelections < dotCount)) {
    throw new Error('config: requiredSelections must be < dotCount');
  }
  if (!Number.isFinite(minDotSpacingMeters) || minDotSpacingMeters < 0) {
    throw new Error('config: minDotSpacingMeters must be a number >= 0');
  }
  if (!Number.isFinite(defaultCenterLat) || !Number.isFinite(defaultCenterLng)) {
    throw new Error('config: defaultCenterLat/Lng must be numbers');
  }
  if (radiusUnit !== 'miles') {
    throw new Error('config: radiusUnit must be "miles" in v1');
  }

  return {
    radiusMiles,
    dotCount,
    requiredSelections,
    blockExtraSelections,
    minDotSpacingMeters,
    mapType,
    radiusUnit,
    confirmOnRecenter,
    seededRng,
    defaultCenter: {
      lat: defaultCenterLat,
      lng: defaultCenterLng,
    },
  };
}

function loadAppConfig() {
  const text = fs.readFileSync(CONFIG_MD, 'utf8');
  return toAppConfig(parseFrontmatter(text));
}

const appConfig = loadAppConfig();

module.exports = {
  appConfig,
  loadAppConfig,
  CONFIG_MD,
  parseFrontmatter,
  toAppConfig,
};
