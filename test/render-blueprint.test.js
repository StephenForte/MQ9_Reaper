import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Minimum Node.js on Render after the 2026-10-21 security release. */
const RENDER_NODE_FLOOR = '26.12.1';

/**
 * @param {string} version
 * @returns {[number, number, number]}
 */
function parseSemver(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  assert.ok(match, `expected x.y.z, got ${version}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * @param {string} version
 * @param {string} floor
 */
function atLeast(version, floor) {
  const left = parseSemver(version);
  const right = parseSemver(floor);
  for (let i = 0; i < 3; i += 1) {
    if (left[i] > right[i]) return true;
    if (left[i] < right[i]) return false;
  }
  return true;
}

describe('Render Node pin', () => {
  it('sets NODE_VERSION to 26.12.1 or newer on the Node runtime', () => {
    const yaml = fs.readFileSync(path.join(root, 'render.yaml'), 'utf8');
    assert.match(yaml, /^ {4}runtime: node$/m);
    const match = yaml.match(/- key: NODE_VERSION\n {8}value: "([^"]+)"/);
    assert.ok(match, 'render.yaml is missing NODE_VERSION');
    assert.equal(atLeast(match[1], RENDER_NODE_FLOOR), true);
    assert.doesNotMatch(yaml, /PYTHON_VERSION|PHP_VERSION|runtime: (python|php|ruby|go|elixir)/);
  });

  it('leaves local engines on Node 20 or newer', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    assert.equal(pkg.engines.node, '>=20');
  });
});
