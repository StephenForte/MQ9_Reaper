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
import { GAME_SCHEMA_ID } from '../public/js/schema.js';

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
    assert.equal(read.document.schema, GAME_SCHEMA_ID);
    assert.equal(read.document.fictional, true);

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

  it('rejects invalid ids before deleting any files', () => {
    const dir = makeTmpDir();
    const store = createTargetsStore(dir);
    const a = store.write(sampleDoc({ title: 'Keep me' }));
    assert.equal(a.ok, true);
    if (!a.ok) return;

    const result = store.deleteMany([a.id, 'not-a-uuid']);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.status, 400);
    assert.equal(result.error, 'Invalid target id.');
    assert.equal(store.list().length, 1);
    assert.equal(store.list()[0].id, a.id);
  });

  it('lists corrupt and schema-invalid files so they can be deleted', () => {
    const dir = makeTmpDir();
    const store = createTargetsStore(dir);
    const valid = store.write(sampleDoc({ title: 'Good' }));
    assert.equal(valid.ok, true);
    if (!valid.ok) return;

    const corruptId = '11111111-1111-4111-8111-111111111111';
    const invalidId = '22222222-2222-4222-8222-222222222222';
    fs.writeFileSync(path.join(dir, `${corruptId}.json`), '{not-json', 'utf8');
    fs.writeFileSync(
      path.join(dir, `${invalidId}.json`),
      `${JSON.stringify({
        version: '1.0',
        createdAt: '2026-07-14T09:00:00.000Z',
        title: 'Broken schema',
        category: 'ops',
      })}\n`,
      'utf8'
    );

    const listed = store.list();
    assert.equal(listed.length, 3);
    const byId = Object.fromEntries(listed.map((item) => [item.id, item]));
    assert.equal(byId[valid.id].invalid, undefined);
    assert.equal(byId[corruptId].invalid, true);
    assert.match(byId[corruptId].error || '', /not valid JSON/i);
    assert.equal(byId[invalidId].invalid, true);
    assert.equal(byId[invalidId].title, 'Broken schema');
    assert.equal(byId[invalidId].category, 'ops');
    assert.match(byId[invalidId].error || '', /schema validation/i);

    assert.equal(store.delete(corruptId).ok, true);
    assert.equal(store.delete(invalidId).ok, true);
    assert.equal(store.list().length, 1);
    assert.equal(store.list()[0].id, valid.id);
  });
});
