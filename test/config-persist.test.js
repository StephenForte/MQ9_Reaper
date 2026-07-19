import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  REPO_CONFIG_MD,
  bootstrapAppConfig,
  ensureConfigSeeded,
  getAppConfig,
  getConfigPath,
  isConfigPersistent,
  loadAppConfig,
  resolveConfigPath,
  serializeFrontmatter,
  setAppConfig,
  writeAppConfig,
} from '../config.js';
import { createApp } from '../server.js';

/**
 * @param {import('express').Express} app
 * @param {string} pathName
 */
async function getJson(app, pathName) {
  const server = app.listen(0);
  try {
    const { port } = /** @type {import('node:net').AddressInfo} */ (
      server.address()
    );
    const res = await fetch(`http://127.0.0.1:${port}${pathName}`);
    const body = await res.json();
    return { status: res.status, body };
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

describe('resolveConfigPath (P7)', () => {
  it('prefers CONFIG_PATH when set', () => {
    const target = path.join(os.tmpdir(), 'mq9-custom-config.md');
    const resolved = resolveConfigPath(
      { CONFIG_PATH: target },
      { persistentDirExists: () => false }
    );
    assert.equal(resolved.path, path.resolve(target));
    assert.equal(resolved.persistent, true);
    assert.equal(resolved.source, 'env');
  });

  it('treats CONFIG_PATH equal to repo as non-persistent', () => {
    const resolved = resolveConfigPath(
      { CONFIG_PATH: REPO_CONFIG_MD },
      { persistentDirExists: () => true }
    );
    assert.equal(resolved.path, path.resolve(REPO_CONFIG_MD));
    assert.equal(resolved.persistent, false);
    assert.equal(resolved.source, 'env');
  });

  it('uses /var/data when the mount directory exists', () => {
    const resolved = resolveConfigPath(
      {},
      { persistentDirExists: (dir) => dir === '/var/data' }
    );
    assert.equal(resolved.path, '/var/data/app-config.md');
    assert.equal(resolved.persistent, true);
    assert.equal(resolved.source, 'disk');
  });

  it('falls back to the repo file when no env and no disk', () => {
    const resolved = resolveConfigPath(
      {},
      { persistentDirExists: () => false }
    );
    assert.equal(resolved.path, REPO_CONFIG_MD);
    assert.equal(resolved.persistent, false);
    assert.equal(resolved.source, 'repo');
  });
});

describe('ensureConfigSeeded (P7)', () => {
  it('copies the repo seed when the target is missing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mq9-seed-'));
    const target = path.join(dir, 'data', 'app-config.md');
    assert.equal(fs.existsSync(target), false);
    const seeded = ensureConfigSeeded(target);
    assert.equal(seeded, true);
    assert.equal(fs.existsSync(target), true);
    const cfg = loadAppConfig(target);
    assert.ok(cfg.maxSelections < cfg.dotCount);
  });

  it('does not overwrite an existing target file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mq9-seed-keep-'));
    const target = path.join(dir, 'app-config.md');
    const original = getAppConfig();
    const custom = { ...original, radiusMiles: 9.5 };
    fs.writeFileSync(target, serializeFrontmatter(custom), 'utf8');
    const seeded = ensureConfigSeeded(target);
    assert.equal(seeded, false);
    assert.equal(loadAppConfig(target).radiusMiles, 9.5);
  });

  it('reseeds when the target path is a directory', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mq9-seed-dir-'));
    const target = path.join(dir, 'app-config.md');
    fs.mkdirSync(target);
    const seeded = ensureConfigSeeded(target);
    assert.equal(seeded, true);
    assert.equal(fs.statSync(target).isFile(), true);
    const cfg = loadAppConfig(target);
    assert.ok(cfg.maxSelections < cfg.dotCount);
  });

  it('reseeds when the target file is empty', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mq9-seed-empty-'));
    const target = path.join(dir, 'app-config.md');
    fs.writeFileSync(target, '', 'utf8');
    const seeded = ensureConfigSeeded(target);
    assert.equal(seeded, true);
    const cfg = loadAppConfig(target);
    assert.ok(cfg.maxSelections < cfg.dotCount);
  });

  it('reseeds when the target file is corrupt', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mq9-seed-corrupt-'));
    const target = path.join(dir, 'app-config.md');
    fs.writeFileSync(target, 'not valid frontmatter\n', 'utf8');
    const seeded = ensureConfigSeeded(target);
    assert.equal(seeded, true);
    const cfg = loadAppConfig(target);
    assert.ok(cfg.maxSelections < cfg.dotCount);
  });
});

describe('bootstrapAppConfig (P7)', () => {
  it('seeds a CONFIG_PATH target and loads it', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mq9-boot-'));
    const target = path.join(dir, 'app-config.md');
    const previous = {
      path: getConfigPath(),
      persistent: isConfigPersistent(),
      config: getAppConfig(),
    };

    try {
      const boot = bootstrapAppConfig(
        { CONFIG_PATH: target },
        { persistentDirExists: () => false }
      );
      assert.equal(boot.seeded, true);
      assert.equal(boot.persistent, true);
      assert.equal(boot.path, path.resolve(target));
      assert.equal(getConfigPath(), path.resolve(target));
      assert.equal(isConfigPersistent(), true);
      assert.ok(fs.existsSync(target));

      writeAppConfig(
        { ...getAppConfig(), radiusMiles: 11 },
        { path: target }
      );
      const again = bootstrapAppConfig(
        { CONFIG_PATH: target },
        { persistentDirExists: () => false }
      );
      assert.equal(again.seeded, false);
      assert.equal(getAppConfig().radiusMiles, 11);
    } finally {
      setAppConfig(previous.config);
      bootstrapAppConfig(
        { CONFIG_PATH: previous.path },
        { persistentDirExists: () => false }
      );
    }
  });

  it('recovers when CONFIG_PATH is a directory', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mq9-boot-dir-'));
    const target = path.join(dir, 'app-config.md');
    fs.mkdirSync(target);
    const previous = {
      path: getConfigPath(),
      config: getAppConfig(),
    };

    try {
      const boot = bootstrapAppConfig(
        { CONFIG_PATH: target },
        { persistentDirExists: () => false }
      );
      assert.equal(boot.seeded, true);
      assert.equal(fs.statSync(target).isFile(), true);
      assert.ok(getAppConfig().dotCount >= 2);
    } finally {
      setAppConfig(previous.config);
      bootstrapAppConfig(
        { CONFIG_PATH: previous.path },
        { persistentDirExists: () => false }
      );
    }
  });

  it('recovers when CONFIG_PATH is empty or corrupt', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mq9-boot-bad-'));
    const emptyTarget = path.join(dir, 'empty.md');
    const corruptTarget = path.join(dir, 'corrupt.md');
    fs.writeFileSync(emptyTarget, '', 'utf8');
    fs.writeFileSync(corruptTarget, '---\nbogus: yes\n---\n', 'utf8');
    const previous = {
      path: getConfigPath(),
      config: getAppConfig(),
    };

    try {
      const emptyBoot = bootstrapAppConfig(
        { CONFIG_PATH: emptyTarget },
        { persistentDirExists: () => false }
      );
      assert.equal(emptyBoot.seeded, true);
      assert.ok(getAppConfig().dotCount >= 2);

      const corruptBoot = bootstrapAppConfig(
        { CONFIG_PATH: corruptTarget },
        { persistentDirExists: () => false }
      );
      assert.equal(corruptBoot.seeded, true);
      assert.ok(getAppConfig().dotCount >= 2);
    } finally {
      setAppConfig(previous.config);
      bootstrapAppConfig(
        { CONFIG_PATH: previous.path },
        { persistentDirExists: () => false }
      );
    }
  });
});

describe('health configPersistent (P7)', () => {
  const stubConfig = {
    radiusMiles: 3,
    dotCount: 25,
    minSelections: 1,
    maxSelections: 12,
    blockExtraSelections: true,
    minDotSpacingMeters: 50,
    mapType: /** @type {'hybrid'} */ ('hybrid'),
    radiusUnit: /** @type {'miles'} */ ('miles'),
    confirmOnRecenter: true,
    seededRng: false,
    candidateSource: 'overpass',
    overpassFillRandom: true,
    defaultCenter: { lat: 37.8, lng: -121.7 },
  };

  it('reports configPersistent from createApp deps', async () => {
    const ephemeral = createApp({
      mapsKey: '',
      geocodingKey: '',
      config: stubConfig,
      configPersistent: false,
      warn: () => {},
    });
    const ephemeralHealth = await getJson(ephemeral, '/api/health');
    assert.equal(ephemeralHealth.body.configPersistent, false);

    const persistent = createApp({
      mapsKey: '',
      geocodingKey: '',
      config: stubConfig,
      configPersistent: true,
      warn: () => {},
    });
    const persistentHealth = await getJson(persistent, '/api/health');
    assert.equal(persistentHealth.body.configPersistent, true);
  });
});
