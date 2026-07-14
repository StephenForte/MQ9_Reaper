import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Loads human-editable defaults from config/app-config.md (YAML frontmatter).
 * Admin UI (PRD P6) will eventually write the same file / values.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const CONFIG_MD = path.join(__dirname, 'config', 'app-config.md');

/**
 * @param {string} field
 * @param {string} detail
 */
function configError(field, detail) {
  throw new Error(
    `config: invalid "${field}" in config/app-config.md — ${detail}`
  );
}

/**
 * Minimal frontmatter parser for flat `key: value` lines (no nested YAML).
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    throw new Error(
      `Missing YAML frontmatter in config/app-config.md (expected a --- ... --- block at the top of the file)`
    );
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
 * @param {string} key
 * @returns {string | undefined}
 */
function rawValue(raw, key) {
  return Object.prototype.hasOwnProperty.call(raw, key) ? raw[key] : undefined;
}

/**
 * @param {Record<string, string>} raw
 * @param {string} key
 * @returns {number}
 */
function requireNumber(raw, key) {
  const value = rawValue(raw, key);
  if (value === undefined || value === '') {
    configError(key, 'missing; set a numeric value');
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    configError(key, `must be a number (got "${value}")`);
  }
  return n;
}

/**
 * @param {Record<string, string>} raw
 * @param {string} key
 * @returns {number}
 */
function requireInteger(raw, key) {
  const n = requireNumber(raw, key);
  if (!Number.isInteger(n)) {
    configError(key, `must be an integer (got "${raw[key]}")`);
  }
  return n;
}

/**
 * @param {Record<string, string>} raw
 */
export function toAppConfig(raw) {
  const radiusMiles = requireNumber(raw, 'radiusMiles');
  const dotCount = requireInteger(raw, 'dotCount');

  const hasMin = rawValue(raw, 'minSelections') !== undefined;
  const hasMax = rawValue(raw, 'maxSelections') !== undefined;
  const hasLegacy = rawValue(raw, 'requiredSelections') !== undefined;

  const minSelections = hasMin
    ? requireInteger(raw, 'minSelections')
    : 1;
  const maxSelections = hasMax
    ? requireInteger(raw, 'maxSelections')
    : hasLegacy
      ? requireInteger(raw, 'requiredSelections')
      : 12;

  const minDotSpacingMeters = requireNumber(raw, 'minDotSpacingMeters');
  const defaultCenterLat = requireNumber(raw, 'defaultCenterLat');
  const defaultCenterLng = requireNumber(raw, 'defaultCenterLng');

  const mapTypeRaw = rawValue(raw, 'mapType');
  if (mapTypeRaw !== undefined && mapTypeRaw !== 'hybrid' && mapTypeRaw !== 'satellite') {
    configError('mapType', 'must be "hybrid" or "satellite"');
  }
  const mapType = mapTypeRaw === 'satellite' ? 'satellite' : 'hybrid';

  const radiusUnitRaw = rawValue(raw, 'radiusUnit');
  const radiusUnit = radiusUnitRaw === 'km' ? 'km' : 'miles';

  const confirmRaw = rawValue(raw, 'confirmOnRecenter');
  if (
    confirmRaw !== undefined &&
    confirmRaw !== 'true' &&
    confirmRaw !== 'false'
  ) {
    configError('confirmOnRecenter', 'must be true or false');
  }
  const confirmOnRecenter = confirmRaw !== 'false';

  const seededRaw = rawValue(raw, 'seededRng');
  if (seededRaw !== undefined && seededRaw !== 'true' && seededRaw !== 'false') {
    configError('seededRng', 'must be true or false');
  }
  const seededRng = seededRaw === 'true';

  const blockRaw = rawValue(raw, 'blockExtraSelections');
  if (blockRaw !== undefined && blockRaw !== 'true' && blockRaw !== 'false') {
    configError('blockExtraSelections', 'must be true or false');
  }
  const blockExtraSelections = blockRaw !== 'false';

  if (!(radiusMiles > 0)) {
    configError('radiusMiles', 'must be a number > 0');
  }
  if (dotCount < 2) {
    configError('dotCount', 'must be an integer >= 2');
  }
  if (minSelections < 1) {
    configError('minSelections', 'must be an integer >= 1');
  }
  if (maxSelections < 1) {
    configError('maxSelections', 'must be an integer >= 1');
  }
  if (!(minSelections <= maxSelections)) {
    configError(
      'minSelections',
      `must be <= maxSelections (got ${minSelections} > ${maxSelections})`
    );
  }
  if (!(maxSelections < dotCount)) {
    configError(
      'maxSelections',
      `must be < dotCount (got ${maxSelections} >= ${dotCount})`
    );
  }
  if (minDotSpacingMeters < 0) {
    configError('minDotSpacingMeters', 'must be a number >= 0');
  }
  if (defaultCenterLat < -90 || defaultCenterLat > 90) {
    configError('defaultCenterLat', 'must be between -90 and 90');
  }
  if (defaultCenterLng < -180 || defaultCenterLng > 180) {
    configError('defaultCenterLng', 'must be between -180 and 180');
  }
  if (radiusUnit !== 'miles') {
    configError('radiusUnit', 'must be "miles" in v1');
  }

  return {
    radiusMiles,
    dotCount,
    minSelections,
    maxSelections,
    minDotSpacingMeters,
    mapType,
    radiusUnit,
    confirmOnRecenter,
    seededRng,
    blockExtraSelections,
    defaultCenter: {
      lat: defaultCenterLat,
      lng: defaultCenterLng,
    },
  };
}

export function loadAppConfig() {
  const text = fs.readFileSync(CONFIG_MD, 'utf8');
  return toAppConfig(parseFrontmatter(text));
}

export const appConfig = loadAppConfig();
