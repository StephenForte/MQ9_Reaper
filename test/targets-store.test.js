import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  createTargetsStore,
  isValidTargetId,
  resolveTargetsPath,
} from '../lib/targets-store.js';

/** @type {string[]} */
const tmpDirs = [];

function makeTmpDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mq9-targets-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function sampleDoc(overrides = {}) {
  return {
    version: '1.0',
    createdAt: '2026-07-14T12:00:00.000Z',
    title: 'Scout package',
    category: 'training',
    center: { lat: 37.8, lng: -121.7, source: 'address' },
    radiusMiles: 3,
    generation: { dotCount: 25, requiredSelections: 1, seed: null },
    targets: [
      {
        id: 't-01',
        name: 'Marker',
        lat: 37.81,
        lng: -121.71,
        confidence: 3,
        priority: 'medium',
      },
    ],
    ...overrides,
  };
}

describe('resolveTargetsPath', () => {
  it('prefers TARGETS_PATH when set', () => {
    const dir = makeTmpDir();
    const resolved = resolveTargetsPath(
      { TARGETS_PATH: dir },
      { persistentDirExists: () => false }
    );
    assert.equal(resolved.path, path.resolve(dir));
    assert.equal(resolved.persistent, true);
    assert.equal(resolved.source, 'env');
  });

  it('uses dirname(CONFIG_PATH)/targets when config is persistent', () => {
    const root = makeTmpDir();
    const configPath = path.join(root, 'app-config.md');
    const resolved = resolveTargetsPath(
      { CONFIG_PATH: configPath },
      { persistentDirExists: () => false }
    );
    assert.equal(resolved.path, path.join(root, 'targets'));
    assert.equal(resolved.persistent, true);
    assert.equal(resolved.source, 'config-dir');
  });

  it('falls back to repo data/targets', () => {
    const resolved = resolveTargetsPath(
      {},
      { persistentDirExists: () => false }
    );
    assert.match(resolved.path, /data[/\\]targets$/);
    assert.equal(resolved.persistent, false);
    assert.equal(resolved.source, 'repo');
  });
});

describe('createTargetsStore', () => {
  it('writes, lists, reads, updates meta, and deletes', () => {
    const dir = makeTmpDir();
    const store = createTargetsStore(dir);

    const written = store.write(sampleDoc());
    assert.equal(written.ok, true);
    if (!written.ok) return;
    assert.equal(isValidTargetId(written.id), true);

    const listed = store.list();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].title, 'Scout package');
    assert.equal(listed[0].category, 'training');

    const read = store.read(written.id);
    assert.equal(read.ok, true);
    if (!read.ok) return;
    assert.equal(read.document.title, 'Scout package');

    const patched = store.updateMeta(written.id, {
      title: 'Renamed',
      category: 'ops',
    });
    assert.equal(patched.ok, true);
    if (!patched.ok) return;
    assert.equal(patched.title, 'Renamed');
    assert.equal(patched.category, 'ops');

    const deleted = store.delete(written.id);
    assert.equal(deleted.ok, true);
    assert.equal(store.list().length, 0);
  });

  it('rejects path-traversal ids and invalid schema writes', () => {
    const dir = makeTmpDir();
    const store = createTargetsStore(dir);

    assert.equal(store.read('../etc/passwd').ok, false);
    assert.equal(store.delete('../../x').ok, false);

    const bad = store.write({ version: '1.0' });
    assert.equal(bad.ok, false);
    assert.equal(bad.status, 400);

    const raw = sampleDoc();
    delete raw.title;
    delete raw.category;
    const legacyWrite = store.write(raw);
    assert.equal(legacyWrite.ok, false);
  });

  it('bulk deletes selected ids', () => {
    const dir = makeTmpDir();
    const store = createTargetsStore(dir);
    const a = store.write(sampleDoc({ title: 'A', createdAt: '2026-07-14T10:00:00Z' }));
    const b = store.write(sampleDoc({ title: 'B', createdAt: '2026-07-14T11:00:00Z' }));
    assert.equal(a.ok && b.ok, true);
    if (!a.ok || !b.ok) return;

    const result = store.deleteMany([a.id, b.id]);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.deleted.sort(), [a.id, b.id].sort());
    assert.equal(store.list().length, 0);
  });
});
