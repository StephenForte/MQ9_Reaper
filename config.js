import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Loads human-editable defaults from config/app-config.md (YAML frontmatter).
 * Admin UI (PRD P6) writes the same file.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const CONFIG_MD = path.join(__dirname, 'config', 'app-config.md');

/**
 * @typedef {{
 *   radiusMiles: number,
 *   dotCount: number,
 *   minSelections: number,
 *   maxSelections: number,
 *   minDotSpacingMeters: number,
 *   mapType: 'hybrid' | 'satellite',
 *   radiusUnit: 'miles' | 'km',
 *   confirmOnRecenter: boolean,
 *   seededRng: boolean,
 *   blockExtraSelections: boolean,
 *   defaultCenter: { lat: number, lng: number },
 * }} AppConfigValue
 */

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
 * Markdown body below the closing `---` of frontmatter.
 * @param {string} text
 * @returns {string}
 */
export function extractMarkdownBody(text) {
  const match = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/);
  return match ? match[1] : '';
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
 * @returns {AppConfigValue}
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

/**
 * Serialize config to YAML frontmatter (flat key: value).
 * @param {AppConfigValue} config
 * @returns {string}
 */
export function serializeFrontmatter(config) {
  const lines = [
    '---',
    `radiusMiles: ${config.radiusMiles}`,
    `dotCount: ${config.dotCount}`,
    `minSelections: ${config.minSelections}`,
    `maxSelections: ${config.maxSelections}`,
    `blockExtraSelections: ${config.blockExtraSelections}`,
    `minDotSpacingMeters: ${config.minDotSpacingMeters}`,
    `mapType: ${config.mapType}`,
    `radiusUnit: ${config.radiusUnit}`,
    `confirmOnRecenter: ${config.confirmOnRecenter}`,
    `seededRng: ${config.seededRng}`,
    `defaultCenterLat: ${config.defaultCenter.lat}`,
    `defaultCenterLng: ${config.defaultCenter.lng}`,
    '---',
    '',
  ];
  return lines.join('\n');
}

/**
 * Build full MD file text, preserving the documentation body.
 * @param {AppConfigValue} config
 * @param {string} [existingText]
 */
export function buildConfigMarkdown(config, existingText = '') {
  const body = existingText
    ? extractMarkdownBody(existingText)
    : '\n# App Config\n\nHuman-editable runtime defaults for MQ9 Reaper.\n';
  return `${serializeFrontmatter(config)}${body.startsWith('\n') ? body.slice(1) : body}`;
}

/**
 * Admin-editable fields (P6). `seededRng` and `radiusUnit` are preserved from current.
 * @param {unknown} body
 * @param {AppConfigValue} current
 * @returns {AppConfigValue}
 */
export function mergeAdminConfigPatch(body, current) {
  if (!body || typeof body !== 'object') {
    throw new Error('config: invalid body — expected a JSON object');
  }
  const patch = /** @type {Record<string, unknown>} */ (body);

  /** @type {Record<string, string>} */
  const raw = {
    radiusMiles: String(
      patch.radiusMiles !== undefined ? patch.radiusMiles : current.radiusMiles
    ),
    dotCount: String(
      patch.dotCount !== undefined ? patch.dotCount : current.dotCount
    ),
    minSelections: String(
      patch.minSelections !== undefined
        ? patch.minSelections
        : current.minSelections
    ),
    maxSelections: String(
      patch.maxSelections !== undefined
        ? patch.maxSelections
        : current.maxSelections
    ),
    blockExtraSelections: String(
      patch.blockExtraSelections !== undefined
        ? patch.blockExtraSelections
        : current.blockExtraSelections
    ),
    minDotSpacingMeters: String(
      patch.minDotSpacingMeters !== undefined
        ? patch.minDotSpacingMeters
        : current.minDotSpacingMeters
    ),
    mapType: String(
      patch.mapType !== undefined ? patch.mapType : current.mapType
    ),
    radiusUnit: current.radiusUnit,
    confirmOnRecenter: String(
      patch.confirmOnRecenter !== undefined
        ? patch.confirmOnRecenter
        : current.confirmOnRecenter
    ),
    seededRng: String(current.seededRng),
    defaultCenterLat: String(
      patch.defaultCenterLat !== undefined
        ? patch.defaultCenterLat
        : patch.defaultCenter &&
            typeof patch.defaultCenter === 'object' &&
            /** @type {{ lat?: unknown }} */ (patch.defaultCenter).lat !==
              undefined
          ? /** @type {{ lat: unknown }} */ (patch.defaultCenter).lat
          : current.defaultCenter.lat
    ),
    defaultCenterLng: String(
      patch.defaultCenterLng !== undefined
        ? patch.defaultCenterLng
        : patch.defaultCenter &&
            typeof patch.defaultCenter === 'object' &&
            /** @type {{ lng?: unknown }} */ (patch.defaultCenter).lng !==
              undefined
          ? /** @type {{ lng: unknown }} */ (patch.defaultCenter).lng
          : current.defaultCenter.lng
    ),
  };

  return toAppConfig(raw);
}

/**
 * Public shape for GET /api/config and Admin responses.
 * @param {AppConfigValue} config
 */
export function defaultsForClient(config) {
  return {
    radiusMiles: config.radiusMiles,
    dotCount: config.dotCount,
    minSelections: config.minSelections,
    maxSelections: config.maxSelections,
    blockExtraSelections: config.blockExtraSelections,
    minDotSpacingMeters: config.minDotSpacingMeters,
    mapType: config.mapType,
    radiusUnit: config.radiusUnit,
    confirmOnRecenter: config.confirmOnRecenter,
    seededRng: config.seededRng,
    center: {
      lat: config.defaultCenter.lat,
      lng: config.defaultCenter.lng,
    },
  };
}

/**
 * @param {string} [filePath]
 * @returns {AppConfigValue}
 */
export function loadAppConfig(filePath = CONFIG_MD) {
  const text = fs.readFileSync(filePath, 'utf8');
  return toAppConfig(parseFrontmatter(text));
}

/**
 * @param {AppConfigValue} config
 * @param {{ path?: string, existingText?: string }} [opts]
 */
export function writeAppConfig(config, opts = {}) {
  const filePath = opts.path || CONFIG_MD;
  const existingText =
    opts.existingText !== undefined
      ? opts.existingText
      : fs.existsSync(filePath)
        ? fs.readFileSync(filePath, 'utf8')
        : '';
  const text = buildConfigMarkdown(config, existingText);
  const dir = path.dirname(filePath);
  const tmp = path.join(
    dir,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`
  );
  fs.writeFileSync(tmp, text, 'utf8');
  try {
    fs.renameSync(tmp, filePath);
  } catch (err) {
    // Windows cannot always rename over an existing file.
    try {
      fs.copyFileSync(tmp, filePath);
      fs.unlinkSync(tmp);
    } catch (cleanupErr) {
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* ignore */
      }
      throw cleanupErr || err;
    }
  }
  return text;
}

/** @type {AppConfigValue} */
let runtimeAppConfig = loadAppConfig();

export function getAppConfig() {
  return runtimeAppConfig;
}

/**
 * @param {AppConfigValue} config
 */
export function setAppConfig(config) {
  runtimeAppConfig = config;
}

/**
 * @param {string} [filePath]
 */
export function reloadAppConfig(filePath = CONFIG_MD) {
  runtimeAppConfig = loadAppConfig(filePath);
  return runtimeAppConfig;
}

/** Prefer getAppConfig() so Admin saves are visible to new createApp() calls. */
export const appConfig = getAppConfig();
