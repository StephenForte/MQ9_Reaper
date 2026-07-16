/**
 * Pure targeting-list helpers — export gates + validation (no DOM).
 */

import { validateFileMeta, validateTargetingRow } from './schema.js';

/** @typedef {import('./schema.js').TargetingRow} TargetingRow */

/**
 * True when live selected ids no longer match the annotate-list snapshot.
 * @param {Array<{ id: string, selected: boolean }>} candidates
 * @param {string[]} snapshotCandidateIds
 * @returns {boolean}
 */
export function isTargetingSelectionStale(candidates, snapshotCandidateIds) {
  const liveIds = candidates
    .filter((dot) => dot.selected)
    .map((dot) => dot.id);
  return !(
    liveIds.length === snapshotCandidateIds.length &&
    liveIds.every((id, i) => id === snapshotCandidateIds[i])
  );
}

/**
 * Disable reason / readiness for Download JSON and Save to server.
 * @param {{
 *   visible: boolean,
 *   stale: boolean,
 *   rows: TargetingRow[],
 *   title: string,
 *   category: string,
 * }} state
 * @returns {{ ready: boolean, title: string }}
 */
export function targetingExportGate(state) {
  if (!state.visible || state.stale || state.rows.length === 0) {
    return {
      ready: false,
      title: state.stale
        ? 'Selection changed — save targets again'
        : 'Complete the targeting list first',
    };
  }

  const metaOk = validateFileMeta({
    title: state.title,
    category: state.category,
  }).ok;
  const rowsOk = state.rows.every((row) => validateTargetingRow(row).ok);
  if (!metaOk) {
    return { ready: false, title: 'Enter a title and category' };
  }
  if (!rowsOk) {
    return {
      ready: false,
      title: 'Fill name, confidence, and priority on every row',
    };
  }
  return { ready: true, title: '' };
}

/**
 * Validate annotate-list state before download / server save.
 * @param {{
 *   visible: boolean,
 *   stale: boolean,
 *   rows: TargetingRow[],
 *   title: string,
 *   category: string,
 *   minSelections: number,
 *   maxSelections: number,
 * }} input
 * @returns {{
 *   ok: true,
 *   rows: TargetingRow[],
 *   title: string,
 *   category: string,
 * } | {
 *   ok: false,
 *   message: string,
 *   rowIndex?: number,
 *   field?: string,
 *   rowMessage?: string,
 * }}
 */
export function collectValidatedTargeting(input) {
  if (!input.visible) {
    return { ok: false, message: 'Save Targets first to build the list.' };
  }
  if (input.stale) {
    return {
      ok: false,
      message:
        'Selection changed. Click Save Targets again before downloading or saving to the server.',
    };
  }

  const meta = validateFileMeta({
    title: input.title,
    category: input.category,
  });
  if (!meta.ok) {
    return { ok: false, message: meta.message, field: meta.field };
  }

  if (
    input.rows.length < input.minSelections ||
    input.rows.length > input.maxSelections
  ) {
    return {
      ok: false,
      message: `Select between ${input.minSelections} and ${input.maxSelections} targets (found ${input.rows.length}).`,
    };
  }

  for (let i = 0; i < input.rows.length; i += 1) {
    const result = validateTargetingRow(input.rows[i]);
    if (!result.ok) {
      return {
        ok: false,
        message: `Target ${input.rows[i].id}: ${result.message}`,
        rowIndex: i,
        field: result.field,
        rowMessage: result.message,
      };
    }
  }

  return {
    ok: true,
    title: meta.title,
    category: meta.category,
    rows: input.rows.map((row) => ({
      ...row,
      name: typeof row.name === 'string' ? row.name.trim() : row.name,
    })),
  };
}
