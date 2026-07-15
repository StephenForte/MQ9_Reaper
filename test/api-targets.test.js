import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { createTargetsStore } from '../lib/targets-store.js';
import { createApp } from '../server.js';

/** @type {string[]} */
const tmpDirs = [];

function makeTmpDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mq9-api-targets-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * @param {import('express').Express} app
 * @param {string} pathName
 * @param {{ method?: string, body?: unknown, headers?: Record<string, string> }} [opts]
 */
async function requestJson(app, pathName, opts = {}) {
  const server = app.listen(0);
  try {
    const { port } = /** @type {import('node:net').AddressInfo} */ (
      server.address()
    );
    /** @type {Record<string, string>} */
    const headers = { ...(opts.headers || {}) };
    const init = {
      method: opts.method || 'GET',
      headers,
    };
    if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }
    const res = await fetch(`http://127.0.0.1:${port}${pathName}`, init);
    const setCookie = res.headers.getSetCookie?.() || [];
    let body;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { status: res.status, body, setCookie };
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

/**
 * @param {string[]} setCookie
 */
function cookieHeaderFromSetCookie(setCookie) {
  return setCookie
    .map((line) => line.split(';')[0])
    .filter(Boolean)
    .join('; ');
}

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
  defaultCenter: { lat: 37.8, lng: -121.7 },
};

const ADMIN_USER = 'admin';
const ADMIN_PASS = 'test-password-12';
const ADMIN_SECRET = 'test-session-secret!';

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

/** @param {Record<string, unknown>} [extra] */
function targetsApp(extra = {}) {
  const dir = makeTmpDir();
  const store = createTargetsStore(dir);
  return {
    dir,
    store,
    app: createApp({
      mapsKey: '',
      geocodingKey: '',
      config: stubConfig,
      adminUsername: ADMIN_USER,
      adminPassword: ADMIN_PASS,
      adminSessionSecret: ADMIN_SECRET,
      targetsStore: store,
      targetsPath: dir,
      targetsPersistent: true,
      warn: () => {},
      ...extra,
    }),
  };
}

async function loginCookie(app) {
  const login = await requestJson(app, '/api/admin/login', {
    method: 'POST',
    body: { username: ADMIN_USER, password: ADMIN_PASS },
  });
  assert.equal(login.status, 200);
  return cookieHeaderFromSetCookie(login.setCookie);
}

describe('/api/targets', () => {
  it('reports targetsPersistent on health', async () => {
    const { app } = targetsApp();
    const { status, body } = await requestJson(app, '/api/health');
    assert.equal(status, 200);
    assert.equal(body.targetsPersistent, true);
  });

  it('saves, lists, and loads publicly', async () => {
    const { app } = targetsApp();

    const created = await requestJson(app, '/api/targets', {
      method: 'POST',
      body: sampleDoc(),
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.ok, true);
    assert.equal(created.body.title, 'Scout package');
    const id = created.body.id;

    const listed = await requestJson(app, '/api/targets');
    assert.equal(listed.status, 200);
    assert.equal(listed.body.targets.length, 1);
    assert.equal(listed.body.targets[0].id, id);

    const loaded = await requestJson(app, `/api/targets/${id}`);
    assert.equal(loaded.status, 200);
    assert.equal(loaded.body.title, 'Scout package');
    assert.equal(loaded.body.targets.length, 1);
  });

  it('rejects invalid schema on POST', async () => {
    const { app } = targetsApp();
    const bad = await requestJson(app, '/api/targets', {
      method: 'POST',
      body: { version: '1.0' },
    });
    assert.equal(bad.status, 400);
    assert.match(bad.body.error || '', /title|createdAt|version/i);
  });

  it('accepts target payloads between 32kb and 256kb', async () => {
    const { app } = targetsApp();
    const pad = 'x'.repeat(40 * 1024);
    const doc = sampleDoc({
      targets: [
        {
          id: 't-01',
          name: `Marker ${pad}`,
          lat: 37.81,
          lng: -121.71,
          confidence: 3,
          priority: 'medium',
        },
      ],
    });
    const serialized = JSON.stringify(doc);
    assert.ok(serialized.length > 32 * 1024);
    assert.ok(serialized.length < 256 * 1024);

    const created = await requestJson(app, '/api/targets', {
      method: 'POST',
      body: doc,
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.ok, true);
  });

  it('requires Admin for PATCH and DELETE', async () => {
    const { app } = targetsApp();
    const created = await requestJson(app, '/api/targets', {
      method: 'POST',
      body: sampleDoc(),
    });
    const id = created.body.id;

    const unauthPatch = await requestJson(app, `/api/targets/${id}`, {
      method: 'PATCH',
      body: { title: 'Nope', category: 'x' },
    });
    assert.equal(unauthPatch.status, 401);

    const unauthDelete = await requestJson(app, `/api/targets/${id}`, {
      method: 'DELETE',
    });
    assert.equal(unauthDelete.status, 401);

    const cookie = await loginCookie(app);
    const patched = await requestJson(app, `/api/targets/${id}`, {
      method: 'PATCH',
      body: { title: 'Renamed', category: 'ops' },
      headers: { Cookie: cookie },
    });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.title, 'Renamed');
    assert.equal(patched.body.category, 'ops');

    const deleted = await requestJson(app, `/api/targets/${id}`, {
      method: 'DELETE',
      headers: { Cookie: cookie },
    });
    assert.equal(deleted.status, 200);
    assert.equal(deleted.body.ok, true);

    const missing = await requestJson(app, `/api/targets/${id}`);
    assert.equal(missing.status, 404);
  });

  it('bulk deletes via Admin endpoint', async () => {
    const { app } = targetsApp();
    const a = await requestJson(app, '/api/targets', {
      method: 'POST',
      body: sampleDoc({ title: 'A' }),
    });
    const b = await requestJson(app, '/api/targets', {
      method: 'POST',
      body: sampleDoc({ title: 'B' }),
    });
    const cookie = await loginCookie(app);

    const bulk = await requestJson(app, '/api/admin/targets/delete', {
      method: 'POST',
      body: { ids: [a.body.id, b.body.id] },
      headers: { Cookie: cookie },
    });
    assert.equal(bulk.status, 200);
    assert.equal(bulk.body.deleted.length, 2);

    const listed = await requestJson(app, '/api/targets');
    assert.equal(listed.body.targets.length, 0);
  });

  it('bulk delete rejects invalid ids without removing valid files', async () => {
    const { app } = targetsApp();
    const a = await requestJson(app, '/api/targets', {
      method: 'POST',
      body: sampleDoc({ title: 'Keep me' }),
    });
    const cookie = await loginCookie(app);

    const bulk = await requestJson(app, '/api/admin/targets/delete', {
      method: 'POST',
      body: { ids: [a.body.id, 'not-a-uuid'] },
      headers: { Cookie: cookie },
    });
    assert.equal(bulk.status, 400);
    assert.match(String(bulk.body.error), /invalid target id/i);

    const listed = await requestJson(app, '/api/targets');
    assert.equal(listed.body.targets.length, 1);
    assert.equal(listed.body.targets[0].id, a.body.id);
  });

  it('rejects invalid ids', async () => {
    const { app } = targetsApp();
    const bad = await requestJson(app, '/api/targets/not-a-uuid');
    assert.equal(bad.status, 400);
  });

  it('lists and deletes corrupt on-disk files via Admin', async () => {
    const { app, dir } = targetsApp();
    const corruptId = '33333333-3333-4333-8333-333333333333';
    fs.writeFileSync(path.join(dir, `${corruptId}.json`), 'not-json', 'utf8');

    const listed = await requestJson(app, '/api/targets');
    assert.equal(listed.status, 200);
    assert.equal(listed.body.targets.length, 1);
    assert.equal(listed.body.targets[0].id, corruptId);
    assert.equal(listed.body.targets[0].invalid, true);

    const cookie = await loginCookie(app);
    const deleted = await requestJson(app, `/api/targets/${corruptId}`, {
      method: 'DELETE',
      headers: { Cookie: cookie },
    });
    assert.equal(deleted.status, 200);
    assert.equal(deleted.body.ok, true);

    const after = await requestJson(app, '/api/targets');
    assert.equal(after.body.targets.length, 0);
  });
});
