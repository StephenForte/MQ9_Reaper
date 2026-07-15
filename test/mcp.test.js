import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  bearerMatches,
  MCP_API_KEY_MIN_LENGTH,
  resolveMcpAuth,
} from '../lib/mcp/auth.js';
import {
  filterTargetList,
  summarizeTargetLibrary,
} from '../lib/mcp/server.js';
import { createTargetsStore } from '../lib/targets-store.js';
import { createApp } from '../server.js';

/** @type {string[]} */
const tmpDirs = [];

function makeTmpDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mq9-mcp-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

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

const MCP_KEY = 'test-mcp-api-key-32chars!!';

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
    let body;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { status: res.status, body };
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

/**
 * @param {string} dir
 * @param {string} [mcpApiKey]
 */
function makeApp(dir, mcpApiKey = MCP_KEY) {
  return createApp({
    mapsKey: 'maps',
    geocodingKey: '',
    config: stubConfig,
    adminUsername: '',
    adminPassword: '',
    targetsStore: createTargetsStore(dir),
    targetsPath: dir,
    targetsPersistent: true,
    mcpApiKey,
  });
}

/**
 * @param {import('express').Express} app
 * @param {string} apiKey
 * @param {(client: Client, baseUrl: string) => Promise<void>} fn
 */
async function withMcpClient(app, apiKey, fn) {
  const server = app.listen(0);
  try {
    const { port } = /** @type {import('node:net').AddressInfo} */ (
      server.address()
    );
    const baseUrl = `http://127.0.0.1:${port}`;
    const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
      requestInit: {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      },
    });
    const client = new Client({ name: 'mq9-mcp-test', version: '1.0.0' });
    await client.connect(transport);
    try {
      await fn(client, baseUrl);
    } finally {
      await client.close();
    }
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

/**
 * @param {{ content?: Array<{ type: string, text?: string }>, isError?: boolean }} result
 */
function parseToolJson(result) {
  assert.equal(result.isError, undefined);
  const text = result.content?.find((c) => c.type === 'text')?.text;
  assert.ok(text, 'expected text content');
  return JSON.parse(text);
}

describe('mcp auth helpers', () => {
  it('resolveMcpAuth requires 16+ char key', () => {
    assert.equal(resolveMcpAuth({ apiKey: '' }).configured, false);
    assert.equal(
      resolveMcpAuth({ apiKey: 'short', warn: () => {} }).configured,
      false
    );
    const ok = resolveMcpAuth({ apiKey: 'a'.repeat(MCP_API_KEY_MIN_LENGTH) });
    assert.equal(ok.configured, true);
  });

  it('bearerMatches is timing-safe and case-insensitive on scheme', () => {
    assert.equal(bearerMatches(`Bearer ${MCP_KEY}`, MCP_KEY), true);
    assert.equal(bearerMatches(`bearer ${MCP_KEY}`, MCP_KEY), true);
    assert.equal(bearerMatches(`Bearer wrong-key-value!!`, MCP_KEY), false);
    assert.equal(bearerMatches(undefined, MCP_KEY), false);
  });
});

describe('mcp library helpers', () => {
  it('filters and summarizes the store', () => {
    const dir = makeTmpDir();
    const store = createTargetsStore(dir);
    store.write(sampleDoc({ title: 'Alpha', category: 'training' }));
    store.write(
      sampleDoc({
        title: 'Bravo ops',
        category: 'ops',
        createdAt: '2026-07-15T12:00:00.000Z',
      })
    );

    const training = filterTargetList(store, { category: 'TRAINING' });
    assert.equal(training.length, 1);
    assert.equal(training[0].title, 'Alpha');

    const bravo = filterTargetList(store, { titleContains: 'bravo' });
    assert.equal(bravo.length, 1);

    const summary = summarizeTargetLibrary(store);
    assert.equal(summary.total, 2);
    assert.equal(summary.byCategory.training, 1);
    assert.equal(summary.byCategory.ops, 1);
    assert.equal(summary.invalidCount, 0);
  });
});

describe('/mcp HTTP gate', () => {
  it('returns 503 when MCP_API_KEY is unset', async () => {
    const dir = makeTmpDir();
    const app = makeApp(dir, '');
    const { status, body } = await requestJson(app, '/mcp', {
      method: 'POST',
      body: { jsonrpc: '2.0', method: 'initialize', id: 1, params: {} },
    });
    assert.equal(status, 503);
    assert.match(body.error, /MCP is not configured/i);
  });

  it('returns 401 without a valid bearer token', async () => {
    const dir = makeTmpDir();
    const app = makeApp(dir);
    const { status, body } = await requestJson(app, '/mcp', {
      method: 'POST',
      body: { jsonrpc: '2.0', method: 'initialize', id: 1, params: {} },
    });
    assert.equal(status, 401);
    assert.match(body.error, /Bearer/i);
  });

  it('reports mcpConfigured on health', async () => {
    const dir = makeTmpDir();
    const off = makeApp(dir, '');
    const offHealth = await requestJson(off, '/api/health');
    assert.equal(offHealth.body.mcpConfigured, false);

    const on = makeApp(dir);
    const onHealth = await requestJson(on, '/api/health');
    assert.equal(onHealth.body.mcpConfigured, true);
  });
});

describe('/mcp tools and resources', () => {
  it('lists, gets, creates, and summarizes targets', async () => {
    const dir = makeTmpDir();
    const store = createTargetsStore(dir);
    const written = store.write(sampleDoc());
    assert.equal(written.ok, true);

    const app = createApp({
      mapsKey: 'maps',
      geocodingKey: '',
      config: stubConfig,
      adminUsername: '',
      adminPassword: '',
      targetsStore: store,
      targetsPath: dir,
      targetsPersistent: true,
      mcpApiKey: MCP_KEY,
    });

    await withMcpClient(app, MCP_KEY, async (client, baseUrl) => {
      const tools = await client.listTools();
      const names = tools.tools.map((t) => t.name).sort();
      assert.deepEqual(names, [
        'create_target',
        'get_target',
        'list_targets',
        'summarize_library',
      ]);

      const listed = parseToolJson(
        await client.callTool({ name: 'list_targets', arguments: {} })
      );
      assert.equal(listed.targets.length, 1);
      assert.equal(listed.targets[0].id, written.id);

      const got = parseToolJson(
        await client.callTool({
          name: 'get_target',
          arguments: { id: written.id },
        })
      );
      assert.equal(got.title, 'Scout package');

      const created = parseToolJson(
        await client.callTool({
          name: 'create_target',
          arguments: {
            document: sampleDoc({
              title: 'MCP drop',
              category: 'ops',
              createdAt: '2026-07-15T08:00:00.000Z',
            }),
          },
        })
      );
      assert.equal(created.ok, true);
      assert.ok(created.id);

      const summary = parseToolJson(
        await client.callTool({ name: 'summarize_library', arguments: {} })
      );
      assert.equal(summary.total, 2);
      assert.equal(summary.byCategory.ops, 1);

      const apiRes = await fetch(`${baseUrl}/api/targets`);
      const apiList = await apiRes.json();
      assert.equal(apiList.targets.length, 2);
      assert.ok(apiList.targets.some((t) => t.title === 'MCP drop'));
    });
  });

  it('rejects invalid create_target documents', async () => {
    const dir = makeTmpDir();
    const app = makeApp(dir);

    await withMcpClient(app, MCP_KEY, async (client) => {
      const result = await client.callTool({
        name: 'create_target',
        arguments: {
          document: { version: '1.0', title: 'Nope' },
        },
      });
      assert.equal(result.isError, true);
      const text = result.content?.find((c) => c.type === 'text')?.text || '';
      assert.match(text, /./);
    });
  });

  it('exposes library and package resources plus prompts', async () => {
    const dir = makeTmpDir();
    const store = createTargetsStore(dir);
    const written = store.write(sampleDoc());
    assert.equal(written.ok, true);

    const app = createApp({
      mapsKey: 'maps',
      geocodingKey: '',
      config: stubConfig,
      adminUsername: '',
      adminPassword: '',
      targetsStore: store,
      targetsPath: dir,
      targetsPersistent: true,
      mcpApiKey: MCP_KEY,
    });

    await withMcpClient(app, MCP_KEY, async (client) => {
      const resources = await client.listResources();
      const uris = resources.resources.map((r) => r.uri);
      assert.ok(uris.includes('targets://library'));
      assert.ok(uris.includes(`targets://${written.id}`));

      const lib = await client.readResource({ uri: 'targets://library' });
      const libText = lib.contents[0]?.text;
      assert.ok(libText);
      const libJson = JSON.parse(libText);
      assert.equal(libJson.targets.length, 1);

      const one = await client.readResource({
        uri: `targets://${written.id}`,
      });
      const doc = JSON.parse(one.contents[0]?.text || '{}');
      assert.equal(doc.title, 'Scout package');

      const prompts = await client.listPrompts();
      const promptNames = prompts.prompts.map((p) => p.name).sort();
      assert.deepEqual(promptNames, [
        'compare_targets',
        'draft_target_package',
        'inspect_target',
      ]);

      const inspect = await client.getPrompt({
        name: 'inspect_target',
        arguments: { id: written.id },
      });
      assert.ok(
        inspect.messages[0]?.content?.text?.includes('Scout package')
      );
    });
  });
});
