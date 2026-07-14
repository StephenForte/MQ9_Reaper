import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Loads human-editable defaults from config/app-config.md (YAML frontmatter).
 * Admin UI writes the same file. On Render (P7), CONFIG_PATH points at the
 * persistent disk; first boot seeds from the repo copy.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Repo seed / local default — checked into git. */
export const REPO_CONFIG_MD = path.join(__dirname, 'config', 'app-config.md');

/** Render Blueprint mounts the persistent disk here (see render.yaml). */
export const DEFAULT_PERSISTENT_DIR = '/var/data';
export const DEFAULT_PERSISTENT_CONFIG = path.join(
  DEFAULT_PERSISTENT_DIR,
  'app-config.md'
);

/** @deprecated Prefer getConfigPath() after bootstrapAppConfig(). Alias of REPO_CONFIG_MD for older imports. */
export const CONFIG_MD = REPO_CONFIG_MD;

/** @type {string} */
let activeConfigPath = REPO_CONFIG_MD;

/** @type {boolean} */
let activeConfigPersistent = false;

/** @type {AppConfigValue | null} */
let runtimeAppConfig = null;

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
 * Absolute path currently used for load/write (after bootstrap).
 */
export function getConfigPath() {
  return activeConfigPath;
}

/**
 * True when the active path is not the repo seed (e.g. Render disk / CONFIG_PATH).
 */
export function isConfigPersistent() {
  return activeConfigPersistent;
}

/**
 * Resolve where Admin writes live.
 * Priority: CONFIG_PATH env → /var/data when that dir exists → repo file.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @param {{ persistentDirExists?: (dir: string) => boolean }} [opts]
 * @returns {{ path: string, persistent: boolean, source: 'env' | 'disk' | 'repo' }}
 */
export function resolveConfigPath(env = process.env, opts = {}) {
  const dirExists =
    opts.persistentDirExists ||
    ((dir) => {
      try {
        return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
      } catch {
        return false;
      }
    });

  const fromEnv =
    typeof env.CONFIG_PATH === 'string' ? env.CONFIG_PATH.trim() : '';
  if (fromEnv) {
    const resolved = path.resolve(fromEnv);
    const persistent =
      path.resolve(resolved) !== path.resolve(REPO_CONFIG_MD);
    return { path: resolved, persistent, source: 'env' };
  }

  if (dirExists(DEFAULT_PERSISTENT_DIR)) {
    return {
      path: DEFAULT_PERSISTENT_CONFIG,
      persistent: true,
      source: 'disk',
    };
  }

  return { path: REPO_CONFIG_MD, persistent: false, source: 'repo' };
}

/**
 * True when targetPath is a regular file that parses as valid app config.
 * Directories, empty files, and corrupt MD are treated as unusable.
 *
 * @param {string} targetPath
 * @returns {boolean}
 */
function isUsableConfigFile(targetPath) {
  try {
    const stat = fs.statSync(targetPath);
    if (!stat.isFile() || stat.size === 0) {
      return false;
    }
    loadAppConfig(targetPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * If target is missing or unusable, copy the repo seed (or seedPath) into place.
 * Does not overwrite a valid existing file (Admin owns the disk after first boot).
 * Unusable means: missing, a directory, empty, or corrupt / invalid frontmatter.
 *
 * @param {string} targetPath
 * @param {string} [seedPath]
 * @returns {boolean} true when a seed copy was written
 */
export function ensureConfigSeeded(targetPath, seedPath = REPO_CONFIG_MD) {
  if (isUsableConfigFile(targetPath)) {
    return false;
  }

  const resolvedTarget = path.resolve(targetPath);
  const resolvedSeed = path.resolve(seedPath);
  // Cannot recover the seed by copying onto itself; leave for loadAppConfig.
  if (resolvedTarget === resolvedSeed) {
    return false;
  }

  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
  const dir = path.dirname(targetPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(seedPath, targetPath);
  return true;
}

/**
 * Resolve path, seed if needed, load into memory. Call once at process start.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @param {{ persistentDirExists?: (dir: string) => boolean }} [opts]
 * @returns {{ path: string, persistent: boolean, source: 'env' | 'disk' | 'repo', seeded: boolean }}
 */
export function bootstrapAppConfig(env = process.env, opts = {}) {
  const resolved = resolveConfigPath(env, opts);
  const seeded = ensureConfigSeeded(resolved.path);
  activeConfigPath = resolved.path;
  activeConfigPersistent = resolved.persistent;
  runtimeAppConfig = loadAppConfig(activeConfigPath);
  return { ...resolved, seeded };
}

function ensureRuntimeLoaded() {
  if (!runtimeAppConfig) {
    runtimeAppConfig = loadAppConfig(getConfigPath());
  }
  return runtimeAppConfig;
}

/**
 * @param {string} [filePath]
 * @returns {AppConfigValue}
 */
export function loadAppConfig(filePath = getConfigPath()) {
  const text = fs.readFileSync(filePath, 'utf8');
  return toAppConfig(parseFrontmatter(text));
}

/**
 * @param {AppConfigValue} config
 * @param {{ path?: string, existingText?: string }} [opts]
 */
export function writeAppConfig(config, opts = {}) {
  const filePath = opts.path || getConfigPath();
  const existingText =
    opts.existingText !== undefined
      ? opts.existingText
      : fs.existsSync(filePath)
        ? fs.readFileSync(filePath, 'utf8')
        : '';
  const text = buildConfigMarkdown(config, existingText);
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
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

export function getAppConfig() {
  return ensureRuntimeLoaded();
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
export function reloadAppConfig(filePath = getConfigPath()) {
  runtimeAppConfig = loadAppConfig(filePath);
  return runtimeAppConfig;
}

ensureRuntimeLoaded();
