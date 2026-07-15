/**
 * Saved-target JSON schema (§4) — build + validate.
 * Shared by P3 export and P4 upload.
 */

import { validateLatLng } from './geo.js';
import { resolveTargetName } from './place-names.js';

/** @typedef {{ lat: number, lng: number }} LatLng */
/** @typedef {'address' | 'click' | 'latlng'} ExportCenterSource */
/** @typedef {'address' | 'click' | 'latlng' | 'default'} CenterSource */

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   lat: number,
 *   lng: number,
 *   confidence: number | null,
 *   priority: string,
 *   candidateId?: string,
 * }} TargetingRow
 */

/**
 * @typedef {{
 *   version: string,
 *   schema?: string,
 *   fictional?: boolean,
 *   createdAt: string,
 *   title?: string,
 *   category?: string,
 *   center: { lat: number, lng: number, source: ExportCenterSource },
 *   radiusMiles: number,
 *   generation: {
 *     dotCount: number,
 *     requiredSelections: number,
 *     seed: number | null,
 *   },
 *   targets: Array<{
 *     id: string,
 *     name: string,
 *     lat: number,
 *     lng: number,
 *     confidence: number,
 *     priority: string,
 *   }>,
 * }} TargetFile
 */

/** Wire format version (forward compat). */
export const SCHEMA_VERSION = '1.0';

/**
 * Product tag: fictional game-target package (guardrail / domain marker).
 * Written on all new exports and server creates.
 */
export const GAME_SCHEMA_ID = 'game-target-1.0';

/**
 * @returns {{ schema: typeof GAME_SCHEMA_ID, fictional: true }}
 */
export function gameMetaFields() {
  return { schema: GAME_SCHEMA_ID, fictional: true };
}

export const PRIORITIES = /** @type {const} */ ([
  'low',
  'medium',
  'high',
  'critical',
]);

/**
 * Schema enum excludes internal "default" — map it for export.
 * @param {CenterSource} source
 * @returns {ExportCenterSource}
 */
export function exportCenterSource(source) {
  if (source === 'address' || source === 'click' || source === 'latlng') {
    return source;
  }
  return 'latlng';
}

/**
 * Stable target ids `t-01` … matching PRD §4.2 style.
 * @param {number} index zero-based
 * @returns {string}
 */
export function targetIdAt(index) {
  return `t-${String(index + 1).padStart(2, '0')}`;
}

/**
 * Snapshot selected candidates into editable targeting rows with defaults.
 * @param {Array<{ id: string, lat: number, lng: number, selected: boolean }>} dots
 * @param {{
 *   regionLabel?: string,
 *   placeNamesByCandidateId?: Record<string, string | null | undefined>,
 * }} [opts]
 * @returns {TargetingRow[]}
 */
export function rowsFromSelectedDots(dots, opts = {}) {
  const regionLabel = opts.regionLabel || 'Region';
  const placeNames = opts.placeNamesByCandidateId || {};

  return dots
    .filter((dot) => dot.selected)
    .map((dot, index) => {
      const index1Based = index + 1;
      const placeName = placeNames[dot.id];
      return {
        id: targetIdAt(index),
        name: resolveTargetName({
          regionLabel,
          index1Based,
          placeName,
        }),
        lat: dot.lat,
        lng: dot.lng,
        confidence: 1,
        priority: 'medium',
        candidateId: dot.id,
      };
    });
}

/**
 * @param {unknown} value
 * @returns {value is number}
 */
function isIntInRange(value, min, max) {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

/**
 * @param {TargetingRow} row
 * @returns {{ ok: true } | { ok: false, field: string, message: string }}
 */
export function validateTargetingRow(row) {
  const name = typeof row.name === 'string' ? row.name.trim() : '';
  if (!name) {
    return { ok: false, field: 'name', message: 'Name is required.' };
  }
  if (!isIntInRange(row.confidence, 1, 5)) {
    return {
      ok: false,
      field: 'confidence',
      message: 'Confidence must be 1–5.',
    };
  }
  if (!PRIORITIES.includes(/** @type {*} */ (row.priority))) {
    return {
      ok: false,
      field: 'priority',
      message: 'Select a priority.',
    };
  }
  return { ok: true };
}

/**
 * @param {TargetingRow[]} rows
 * @param {{ minSelections: number, maxSelections: number }} limits
 * @returns {{
 *   ok: true,
 *   rows: TargetingRow[],
 * } | {
 *   ok: false,
 *   message: string,
 *   rowIndex?: number,
 *   field?: string,
 * }}
 */
export function validateTargetingRows(rows, limits) {
  const { minSelections, maxSelections } = limits;
  if (!Array.isArray(rows)) {
    return { ok: false, message: 'Expected a list of targets.' };
  }
  if (rows.length < minSelections || rows.length > maxSelections) {
    return {
      ok: false,
      message: `Select between ${minSelections} and ${maxSelections} targets (found ${rows.length}).`,
    };
  }

  for (let i = 0; i < rows.length; i += 1) {
    const result = validateTargetingRow(rows[i]);
    if (!result.ok) {
      return {
        ok: false,
        message: `Target ${rows[i].id}: ${result.message}`,
        rowIndex: i,
        field: result.field,
      };
    }
  }

  return { ok: true, rows };
}

/**
 * Validate file-level title + category (required on new exports).
 * @param {{ title?: unknown, category?: unknown }} input
 * @returns {{
 *   ok: true,
 *   title: string,
 *   category: string,
 * } | {
 *   ok: false,
 *   field: 'title' | 'category',
 *   message: string,
 * }}
 */
export function validateFileMeta(input) {
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const category =
    typeof input.category === 'string' ? input.category.trim() : '';
  if (!title) {
    return { ok: false, field: 'title', message: 'Title is required.' };
  }
  if (!category) {
    return { ok: false, field: 'category', message: 'Category is required.' };
  }
  return { ok: true, title, category };
}

/**
 * Display defaults for legacy files missing title/category.
 * @param {Pick<TargetFile, 'title' | 'category'> | Record<string, unknown>} doc
 * @param {{ fallbackTitle?: string }} [opts]
 * @returns {{ title: string, category: string }}
 */
export function normalizeTargetFileMeta(doc, opts = {}) {
  const fallbackTitle =
    typeof opts.fallbackTitle === 'string' && opts.fallbackTitle.trim()
      ? opts.fallbackTitle.trim()
      : 'Untitled';
  const rawTitle = /** @type {{ title?: unknown }} */ (doc).title;
  const rawCategory = /** @type {{ category?: unknown }} */ (doc).category;
  const title =
    typeof rawTitle === 'string' && rawTitle.trim()
      ? rawTitle.trim()
      : fallbackTitle;
  const category =
    typeof rawCategory === 'string' ? rawCategory.trim() : '';
  return { title, category };
}

/**
 * @param {{
 *   center: LatLng,
 *   source: CenterSource,
 *   radiusMiles: number,
 *   dotCount: number,
 *   minSelections: number,
 *   maxSelections: number,
 *   seed?: number | null,
 *   rows: TargetingRow[],
 *   title: string,
 *   category: string,
 *   createdAt?: string,
 * }} input
 * @returns {{ ok: true, document: TargetFile } | { ok: false, message: string, rowIndex?: number, field?: string }}
 */
export function buildTargetFile(input) {
  const meta = validateFileMeta({
    title: input.title,
    category: input.category,
  });
  if (!meta.ok) {
    return { ok: false, message: meta.message, field: meta.field };
  }

  const validated = validateTargetingRows(input.rows, {
    minSelections: input.minSelections,
    maxSelections: input.maxSelections,
  });
  if (!validated.ok) {
    return validated;
  }

  if (!(input.radiusMiles > 0) || !Number.isFinite(input.radiusMiles)) {
    return { ok: false, message: 'Radius must be greater than 0.' };
  }

  const createdAt = input.createdAt || new Date().toISOString();
  // §4 keeps requiredSelections; write the actual exported count.
  const requiredSelections = validated.rows.length;
  /** @type {TargetFile} */
  const document = {
    version: SCHEMA_VERSION,
    ...gameMetaFields(),
    createdAt,
    title: meta.title,
    category: meta.category,
    center: {
      lat: input.center.lat,
      lng: input.center.lng,
      source: exportCenterSource(input.source),
    },
    radiusMiles: input.radiusMiles,
    generation: {
      dotCount: input.dotCount,
      requiredSelections,
      seed: input.seed === undefined ? null : input.seed,
    },
    targets: validated.rows.map((row) => ({
      id: row.id,
      name: row.name.trim(),
      lat: row.lat,
      lng: row.lng,
      confidence: /** @type {number} */ (row.confidence),
      priority: row.priority,
    })),
  };

  const check = validateTargetFile(document);
  if (!check.ok) {
    return { ok: false, message: check.message };
  }

  return { ok: true, document };
}

/**
 * Validate a parsed JSON document against §4 (P3 build + P4 upload).
 * Unknown keys are ignored; missing/invalid required fields fail.
 *
 * @param {unknown} raw
 * @returns {{ ok: true, document: TargetFile } | { ok: false, message: string }}
 */
export function validateTargetFile(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, message: 'File must be a JSON object.' };
  }

  const doc = /** @type {Record<string, unknown>} */ (raw);

  if (doc.version !== SCHEMA_VERSION) {
    return {
      ok: false,
      message: `Unsupported version (expected "${SCHEMA_VERSION}").`,
    };
  }

  const hasSchema = Object.prototype.hasOwnProperty.call(doc, 'schema');
  const hasFictional = Object.prototype.hasOwnProperty.call(doc, 'fictional');
  /** @type {boolean} */
  let gameMetaPresent = false;
  if (hasSchema || hasFictional) {
    if (!hasSchema || !hasFictional) {
      return {
        ok: false,
        message: 'schema and fictional must both be present when either is set.',
      };
    }
    if (doc.schema !== GAME_SCHEMA_ID) {
      return {
        ok: false,
        message: `schema must be "${GAME_SCHEMA_ID}".`,
      };
    }
    if (doc.fictional !== true) {
      return { ok: false, message: 'fictional must be true.' };
    }
    gameMetaPresent = true;
  }

  if (typeof doc.createdAt !== 'string' || !doc.createdAt.trim()) {
    return { ok: false, message: 'createdAt must be a non-empty string.' };
  }

  const hasTitle = Object.prototype.hasOwnProperty.call(doc, 'title');
  const hasCategory = Object.prototype.hasOwnProperty.call(doc, 'category');
  /** @type {string | undefined} */
  let title;
  /** @type {string | undefined} */
  let category;
  if (hasTitle || hasCategory) {
    if (!hasTitle || !hasCategory) {
      return {
        ok: false,
        message: 'title and category must both be present when either is set.',
      };
    }
    if (typeof doc.title !== 'string' || !doc.title.trim()) {
      return { ok: false, message: 'title must be a non-empty string.' };
    }
    if (typeof doc.category !== 'string' || !doc.category.trim()) {
      return { ok: false, message: 'category must be a non-empty string.' };
    }
    title = doc.title.trim();
    category = doc.category.trim();
  }

  const center = doc.center;
  if (!center || typeof center !== 'object' || Array.isArray(center)) {
    return { ok: false, message: 'center is required.' };
  }
  const c = /** @type {Record<string, unknown>} */ (center);
  const centerErr = validateLatLng(c.lat, c.lng);
  if (centerErr) {
    return { ok: false, message: `center: ${centerErr}` };
  }
  if (c.source !== 'address' && c.source !== 'click' && c.source !== 'latlng') {
    return {
      ok: false,
      message: 'center.source must be "address", "click", or "latlng".',
    };
  }

  if (typeof doc.radiusMiles !== 'number' || !(doc.radiusMiles > 0)) {
    return { ok: false, message: 'radiusMiles must be a number > 0.' };
  }

  const generation = doc.generation;
  if (!generation || typeof generation !== 'object' || Array.isArray(generation)) {
    return { ok: false, message: 'generation is required.' };
  }
  const g = /** @type {Record<string, unknown>} */ (generation);
  if (!Number.isInteger(g.dotCount) || /** @type {number} */ (g.dotCount) < 1) {
    return { ok: false, message: 'generation.dotCount must be an integer ≥ 1.' };
  }
  if (
    !Number.isInteger(g.requiredSelections) ||
    /** @type {number} */ (g.requiredSelections) < 1
  ) {
    return {
      ok: false,
      message: 'generation.requiredSelections must be an integer ≥ 1.',
    };
  }
  if (g.seed !== null && typeof g.seed !== 'number') {
    return { ok: false, message: 'generation.seed must be a number or null.' };
  }

  const required = /** @type {number} */ (g.requiredSelections);
  if (!Array.isArray(doc.targets)) {
    return { ok: false, message: 'targets must be an array.' };
  }
  if (doc.targets.length !== required) {
    return {
      ok: false,
      message: `expected ${required} targets, found ${doc.targets.length}`,
    };
  }

  /** @type {TargetFile['targets']} */
  const targets = [];
  const seenIds = new Set();

  for (let i = 0; i < doc.targets.length; i += 1) {
    const item = doc.targets[i];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { ok: false, message: `targets[${i}] must be an object.` };
    }
    const t = /** @type {Record<string, unknown>} */ (item);

    if (typeof t.id !== 'string' || !t.id.trim()) {
      return { ok: false, message: `targets[${i}].id must be a non-empty string.` };
    }
    if (seenIds.has(t.id)) {
      return { ok: false, message: `Duplicate target id "${t.id}".` };
    }
    seenIds.add(t.id);

    if (typeof t.name !== 'string' || !t.name.trim()) {
      return {
        ok: false,
        message: `targets[${i}].name must be a non-empty string.`,
      };
    }

    const posErr = validateLatLng(t.lat, t.lng);
    if (posErr) {
      return { ok: false, message: `targets[${i}]: ${posErr}` };
    }

    if (!isIntInRange(t.confidence, 1, 5)) {
      return {
        ok: false,
        message: `targets[${i}].confidence must be an integer 1–5.`,
      };
    }

    if (!PRIORITIES.includes(/** @type {*} */ (t.priority))) {
      return {
        ok: false,
        message: `targets[${i}].priority must be low|medium|high|critical.`,
      };
    }

    targets.push({
      id: t.id,
      name: t.name.trim(),
      lat: /** @type {number} */ (t.lat),
      lng: /** @type {number} */ (t.lng),
      confidence: /** @type {number} */ (t.confidence),
      priority: /** @type {string} */ (t.priority),
    });
  }

  /** @type {TargetFile} */
  const document = {
    version: SCHEMA_VERSION,
    createdAt: /** @type {string} */ (doc.createdAt),
    center: {
      lat: /** @type {number} */ (c.lat),
      lng: /** @type {number} */ (c.lng),
      source: /** @type {ExportCenterSource} */ (c.source),
    },
    radiusMiles: /** @type {number} */ (doc.radiusMiles),
    generation: {
      dotCount: /** @type {number} */ (g.dotCount),
      requiredSelections: required,
      seed: /** @type {number | null} */ (g.seed),
    },
    targets,
  };
  if (gameMetaPresent) {
    document.schema = GAME_SCHEMA_ID;
    document.fictional = true;
  }
  if (title !== undefined && category !== undefined) {
    document.title = title;
    document.category = category;
  }

  return {
    ok: true,
    document,
  };
}
