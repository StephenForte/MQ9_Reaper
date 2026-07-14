import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  buildConfigMarkdown,
  mergeAdminConfigPatch,
  parseFrontmatter,
  serializeFrontmatter,
  toAppConfig,
  writeAppConfig,
} from '../config.js';
import {
  createSessionToken,
  verifySessionToken,
} from '../lib/admin-session.js';
import { createApp } from '../server.js';

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

describe('admin session tokens', () => {
  it('round-trips a valid session', () => {
    const token = createSessionToken('ops', 'secret');
    assert.equal(verifySessionToken(token, 'ops', 'secret'), true);
    assert.equal(verifySessionToken(token, 'ops', 'wrong'), false);
    assert.equal(verifySessionToken(token, 'other', 'secret'), false);
  });
});

describe('config serialize / merge', () => {
  it('round-trips frontmatter through serialize + parse', () => {
    const raw = serializeFrontmatter(stubConfig);
    const parsed = toAppConfig(parseFrontmatter(raw));
    assert.deepEqual(parsed, stubConfig);
  });

  it('preserves markdown body when writing', () => {
    const existing = `${serializeFrontmatter(stubConfig)}\n# Keep me\n\nDocs stay.\n`;
    const next = {
      ...stubConfig,
      radiusMiles: 5,
      maxSelections: 8,
    };
    const built = buildConfigMarkdown(next, existing);
    assert.match(built, /# Keep me/);
    assert.match(built, /Docs stay/);
    assert.equal(toAppConfig(parseFrontmatter(built)).radiusMiles, 5);
  });

  it('mergeAdminConfigPatch validates and preserves seededRng/radiusUnit', () => {
    const next = mergeAdminConfigPatch(
      {
        radiusMiles: 4,
        dotCount: 30,
        minSelections: 2,
        maxSelections: 10,
        blockExtraSelections: false,
        minDotSpacingMeters: 40,
        mapType: 'satellite',
        confirmOnRecenter: false,
        defaultCenterLat: 40.1,
        defaultCenterLng: -74.2,
        seededRng: true,
        radiusUnit: 'km',
      },
      stubConfig
    );
    assert.equal(next.radiusMiles, 4);
    assert.equal(next.mapType, 'satellite');
    assert.equal(next.confirmOnRecenter, false);
    assert.equal(next.blockExtraSelections, false);
    assert.equal(next.defaultCenter.lat, 40.1);
    assert.equal(next.seededRng, false);
    assert.equal(next.radiusUnit, 'miles');
  });

  it('rejects invalid admin patches', () => {
    assert.throws(
      () =>
        mergeAdminConfigPatch(
          { maxSelections: 25, dotCount: 25 },
          stubConfig
        ),
      /maxSelections/
    );
  });

  it('writeAppConfig writes a temp file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mq9-config-'));
    const filePath = path.join(dir, 'app-config.md');
    const existing = `${serializeFrontmatter(stubConfig)}\n# Body\n`;
    fs.writeFileSync(filePath, existing, 'utf8');
    writeAppConfig(
      { ...stubConfig, radiusMiles: 6 },
      { path: filePath }
    );
    const text = fs.readFileSync(filePath, 'utf8');
    assert.match(text, /radiusMiles: 6/);
    assert.match(text, /# Body/);
  });
});

describe('Admin API', () => {
  it('reports adminConfigured on health and config', async () => {
    const off = createApp({
      mapsKey: 'm',
      geocodingKey: '',
      config: stubConfig,
      adminUsername: '',
      adminPassword: '',
    });
    const offHealth = await requestJson(off, '/api/health');
    assert.equal(offHealth.body.adminConfigured, false);
    const offConfig = await requestJson(off, '/api/config');
    assert.equal(offConfig.body.adminConfigured, false);

    const on = createApp({
      mapsKey: 'm',
      geocodingKey: '',
      config: { ...stubConfig },
      adminUsername: 'admin',
      adminPassword: 'pass',
    });
    const onHealth = await requestJson(on, '/api/health');
    assert.equal(onHealth.body.adminConfigured, true);
  });

  it('rejects login when admin is not configured', async () => {
    const app = createApp({
      mapsKey: '',
      geocodingKey: '',
      config: stubConfig,
      adminUsername: '',
      adminPassword: '',
    });
    const { status, body } = await requestJson(app, '/api/admin/login', {
      method: 'POST',
      body: { username: 'a', password: 'b' },
    });
    assert.equal(status, 503);
    assert.match(body.error, /not configured/i);
  });

  it('rejects bad credentials', async () => {
    const app = createApp({
      mapsKey: '',
      geocodingKey: '',
      config: stubConfig,
      adminUsername: 'admin',
      adminPassword: 'pass',
    });
    const { status, body } = await requestJson(app, '/api/admin/login', {
      method: 'POST',
      body: { username: 'admin', password: 'nope' },
    });
    assert.equal(status, 401);
    assert.match(body.error, /Invalid/i);
  });

  it('requires auth for config GET/PUT', async () => {
    const app = createApp({
      mapsKey: '',
      geocodingKey: '',
      config: { ...stubConfig },
      adminUsername: 'admin',
      adminPassword: 'pass',
      writeConfigFn: () => {},
    });
    const getUnauth = await requestJson(app, '/api/admin/config');
    assert.equal(getUnauth.status, 401);

    const putUnauth = await requestJson(app, '/api/admin/config', {
      method: 'PUT',
      body: { radiusMiles: 4 },
    });
    assert.equal(putUnauth.status, 401);
  });

  it('login → save config → public /api/config reflects change', async () => {
    /** @type {typeof stubConfig | null} */
    let written = null;
    const live = { ...stubConfig };
    const app = createApp({
      mapsKey: 'browser-key',
      geocodingKey: '',
      config: live,
      adminUsername: 'admin',
      adminPassword: 'pass',
      writeConfigFn: (cfg) => {
        written = cfg;
        Object.assign(live, cfg);
      },
    });

    const login = await requestJson(app, '/api/admin/login', {
      method: 'POST',
      body: { username: 'admin', password: 'pass' },
    });
    assert.equal(login.status, 200);
    assert.equal(login.body.authenticated, true);
    const cookie = cookieHeaderFromSetCookie(login.setCookie);
    assert.match(cookie, /mq9_admin=/);

    const save = await requestJson(app, '/api/admin/config', {
      method: 'PUT',
      headers: { Cookie: cookie },
      body: {
        radiusMiles: 7,
        dotCount: 40,
        minSelections: 2,
        maxSelections: 15,
        blockExtraSelections: false,
        minDotSpacingMeters: 60,
        mapType: 'satellite',
        confirmOnRecenter: false,
        defaultCenterLat: 41.2,
        defaultCenterLng: -73.5,
      },
    });
    assert.equal(save.status, 200);
    assert.equal(save.body.ok, true);
    assert.equal(save.body.applyRequired, true);
    assert.equal(save.body.defaults.radiusMiles, 7);
    assert.equal(save.body.defaults.mapType, 'satellite');
    assert.ok(written);
    assert.equal(written.radiusMiles, 7);

    const pub = await requestJson(app, '/api/config');
    assert.equal(pub.body.defaults.radiusMiles, 7);
    assert.equal(pub.body.defaults.maxSelections, 15);
    assert.equal(pub.body.defaults.confirmOnRecenter, false);
    assert.equal(pub.body.defaults.center.lat, 41.2);
    assert.equal(pub.body.defaults.seededRng, false);
  });

  it('returns 400 for invalid config saves', async () => {
    const app = createApp({
      mapsKey: '',
      geocodingKey: '',
      config: { ...stubConfig },
      adminUsername: 'admin',
      adminPassword: 'pass',
      writeConfigFn: () => {},
    });
    const login = await requestJson(app, '/api/admin/login', {
      method: 'POST',
      body: { username: 'admin', password: 'pass' },
    });
    const cookie = cookieHeaderFromSetCookie(login.setCookie);
    const save = await requestJson(app, '/api/admin/config', {
      method: 'PUT',
      headers: { Cookie: cookie },
      body: { maxSelections: 100, dotCount: 25 },
    });
    assert.equal(save.status, 400);
    assert.match(save.body.error, /maxSelections|dotCount/i);
  });

  it('logout clears the session cookie', async () => {
    const app = createApp({
      mapsKey: '',
      geocodingKey: '',
      config: stubConfig,
      adminUsername: 'admin',
      adminPassword: 'pass',
    });
    const login = await requestJson(app, '/api/admin/login', {
      method: 'POST',
      body: { username: 'admin', password: 'pass' },
    });
    const cookie = cookieHeaderFromSetCookie(login.setCookie);
    const session = await requestJson(app, '/api/admin/session', {
      headers: { Cookie: cookie },
    });
    assert.equal(session.body.authenticated, true);

    const logout = await requestJson(app, '/api/admin/logout', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: {},
    });
    assert.equal(logout.status, 200);
    assert.ok(
      logout.setCookie.some((c) => /mq9_admin=.*Max-Age=0/i.test(c))
    );
  });

  it('reports session state when admin is configured or not', async () => {
    const off = createApp({
      mapsKey: '',
      geocodingKey: '',
      config: stubConfig,
      adminUsername: '',
      adminPassword: '',
    });
    const offSession = await requestJson(off, '/api/admin/session');
    assert.deepEqual(offSession.body, {
      adminConfigured: false,
      authenticated: false,
    });

    const on = createApp({
      mapsKey: '',
      geocodingKey: '',
      config: stubConfig,
      adminUsername: 'admin',
      adminPassword: 'pass',
    });
    const anon = await requestJson(on, '/api/admin/session');
    assert.equal(anon.body.adminConfigured, true);
    assert.equal(anon.body.authenticated, false);
  });
});
