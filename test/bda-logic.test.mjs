import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BDA_SCORE_MAX,
  BDA_SCORE_MIN,
  assignBdaScores,
  bdaScoreNorm,
  clampBdaScore,
  colorForBdaScore,
  formatBdaLoadStatus,
  formatBdaScoreLabel,
  randomBdaScore,
  summarizeBdaScores,
} from '../public/js/bda-logic.js';

describe('bda-logic', () => {
  it('randomBdaScore stays in [65, 100]', () => {
    let i = 0;
    const values = [0, 0.5, 0.999999];
    for (const v of values) {
      const score = randomBdaScore(() => v);
      assert.ok(score >= BDA_SCORE_MIN && score <= BDA_SCORE_MAX);
      i += 1;
    }
    assert.equal(i, 3);
    assert.equal(randomBdaScore(() => 0), BDA_SCORE_MIN);
    assert.equal(randomBdaScore(() => 0.999999), BDA_SCORE_MAX);
  });

  it('assignBdaScores maps every id', () => {
    let n = 0;
    const scores = assignBdaScores(['a', 'b', 'c'], () => {
      n += 0.1;
      return n % 1;
    });
    assert.equal(scores.size, 3);
    assert.ok(scores.has('a'));
    assert.ok(scores.has('b'));
    assert.ok(scores.has('c'));
  });

  it('colorForBdaScore goes red at min and green at max', () => {
    const low = colorForBdaScore(BDA_SCORE_MIN);
    const high = colorForBdaScore(BDA_SCORE_MAX);
    assert.equal(low.hue, 0);
    assert.equal(high.hue, 120);
    assert.match(low.fill, /^hsl\(0,/);
    assert.match(high.fill, /^hsl\(120,/);
  });

  it('clamp and format helpers', () => {
    assert.equal(clampBdaScore(50), 65);
    assert.equal(clampBdaScore(110), 100);
    assert.equal(bdaScoreNorm(65), 0);
    assert.equal(bdaScoreNorm(100), 1);
    assert.equal(formatBdaScoreLabel(87), '87%');
  });

  it('summarizeBdaScores and formatBdaLoadStatus', () => {
    assert.deepEqual(summarizeBdaScores([]), {
      count: 0,
      avg: null,
      min: null,
      max: null,
    });
    assert.deepEqual(summarizeBdaScores([65, 100, 80]), {
      count: 3,
      avg: 82,
      min: 65,
      max: 100,
    });
    assert.equal(formatBdaLoadStatus([]), 'No file loaded.');
    assert.match(
      formatBdaLoadStatus([65, 100]),
      /Loaded 2 targets with BDA scores \(avg 83%, range 65–100%\)\./
    );
  });
});
