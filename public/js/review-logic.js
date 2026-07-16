/**
 * Pure Review helpers — parse/validate + display formatting (no DOM / Maps).
 */

import { labelForCenterSource } from './selection-logic.js';
import { normalizeTargetFileMeta, validateTargetFile } from './schema.js';

/** @typedef {import('./schema.js').TargetFile} TargetFile */

export const MALFORMED_JSON_MESSAGE = "This file isn't valid JSON.";

/** Operator-facing copy for corrupt / schema-invalid files on the server disk. */
export const INVALID_STORED_TARGET_MESSAGE =
  'File is corrupt or schema-invalid. Delete it from Admin.';

/**
 * Parse upload text then validate against §4.
 * @param {string} text
 * @returns {{ ok: true, document: TargetFile } | { ok: false, message: string }}
 */
export function parseTargetFileJson(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, message: MALFORMED_JSON_MESSAGE };
  }
  return validateTargetFile(raw);
}

/**
 * @param {string} priority
 * @returns {string}
 */
export function formatPriorityLabel(priority) {
  if (!priority) return '';
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

/**
 * @param {number} confidence
 * @returns {string}
 */
export function formatConfidenceLabel(confidence) {
  return `${confidence} / 5`;
}

/**
 * Lines for InfoWindow / accessibility labels (XSS-safe when joined via textContent).
 * @param {{ name: string, confidence: number, priority: string }} target
 * @returns {string[]}
 */
export function targetInfoLines(target) {
  return [
    target.name,
    `Confidence: ${formatConfidenceLabel(target.confidence)}`,
    `Priority: ${formatPriorityLabel(target.priority)}`,
  ];
}

/**
 * Side-panel metadata for a loaded file.
 * @param {TargetFile} doc
 * @param {string} [filename]
 * @returns {{
 *   filename: string,
 *   title: string,
 *   category: string,
 *   createdAt: string,
 *   center: string,
 *   source: string,
 *   radius: string,
 *   targetCount: string,
 * }}
 */
export function formatReviewMeta(doc, filename = '') {
  const meta = normalizeTargetFileMeta(doc, { fallbackTitle: filename || 'Untitled' });
  return {
    filename: filename || '—',
    title: meta.title,
    category: meta.category || '—',
    createdAt: doc.createdAt || '—',
    center: `${doc.center.lat.toFixed(4)}, ${doc.center.lng.toFixed(4)}`,
    source: labelForCenterSource(doc.center.source),
    radius: `${doc.radiusMiles} mi`,
    targetCount: String(doc.targets.length),
  };
}
