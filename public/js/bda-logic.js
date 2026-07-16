/**
 * Pure BDA helpers — damage scores (65–100%) and red→green color mapping.
 */

export const BDA_SCORE_MIN = 65;
export const BDA_SCORE_MAX = 100;

/**
 * Random integer damage score in [65, 100].
 * @param {() => number} [rng] Math.random-compatible
 * @returns {number}
 */
export function randomBdaScore(rng = Math.random) {
  const span = BDA_SCORE_MAX - BDA_SCORE_MIN;
  return BDA_SCORE_MIN + Math.floor(rng() * (span + 1));
}

/**
 * Assign a fresh score per target id (stable for a given load).
 * @param {Iterable<string>} targetIds
 * @param {() => number} [rng]
 * @returns {Map<string, number>}
 */
export function assignBdaScores(targetIds, rng = Math.random) {
  /** @type {Map<string, number>} */
  const scores = new Map();
  for (const id of targetIds) {
    scores.set(id, randomBdaScore(rng));
  }
  return scores;
}

/**
 * Clamp score into the BDA range.
 * @param {number} score
 * @returns {number}
 */
export function clampBdaScore(score) {
  if (!Number.isFinite(score)) return BDA_SCORE_MIN;
  return Math.min(BDA_SCORE_MAX, Math.max(BDA_SCORE_MIN, Math.round(score)));
}

/**
 * Normalize score to 0…1 within the BDA range.
 * @param {number} score
 * @returns {number}
 */
export function bdaScoreNorm(score) {
  const clamped = clampBdaScore(score);
  return (clamped - BDA_SCORE_MIN) / (BDA_SCORE_MAX - BDA_SCORE_MIN);
}

/**
 * Red (65%) → green (100%) via HSL hue 0→120.
 * @param {number} score
 * @returns {{ fill: string, stroke: string, hue: number }}
 */
export function colorForBdaScore(score) {
  const t = bdaScoreNorm(score);
  const hue = Math.round(t * 120);
  return {
    hue,
    fill: `hsl(${hue}, 72%, 42%)`,
    stroke: `hsl(${hue}, 55%, 78%)`,
  };
}

/**
 * @param {number} score
 * @returns {string}
 */
export function formatBdaScoreLabel(score) {
  return `${clampBdaScore(score)}%`;
}
