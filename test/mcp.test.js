import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
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
    assert.equal(offHealth.body.mcpOauthConfigured, false);

    const on = makeApp(dir);
    const onHealth = await requestJson(on, '/api/health');
    assert.equal(onHealth.body.mcpConfigured, true);
    assert.equal(onHealth.body.mcpOauthConfigured, false);
  });
});

describe('/mcp OAuth (Claude connector)', () => {
  const OAUTH_CLIENT_ID = '11111111-1111-4111-8111-111111111111';
  const OAUTH_CLIENT_SECRET = 'oauth-client-secret-16+';

  /**
   * @param {(publicUrl: string) => import('express').Express} buildApp
   * @param {(ctx: { baseUrl: string, port: number }) => Promise<void>} fn
   */
  async function withPublicServer(buildApp, fn) {
    const probe = net.createServer();
    await new Promise((resolve) => {
      probe.listen(0, '127.0.0.1', resolve);
    });
    const port = /** @type {import('node:net').AddressInfo} */ (probe.address())
      .port;
    await new Promise((resolve, reject) => {
      probe.close((err) => (err ? reject(err) : resolve()));
    });

    const publicUrl = `http://127.0.0.1:${port}`;
    const app = buildApp(publicUrl);
    const server = app.listen(port, '127.0.0.1');
    try {
      await fn({ baseUrl: publicUrl, port });
    } finally {
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  }

  /**
   * @returns {{ verifier: string, challenge: string }}
   */
  function makePkce() {
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto
      .createHash('sha256')
      .update(verifier)
      .digest('base64url');
    return { verifier, challenge };
  }

  it('advertises AS + PRM metadata and completes code+PKCE token exchange', async () => {
    const dir = makeTmpDir();
    const store = createTargetsStore(dir);
    store.write(sampleDoc());

    await withPublicServer(
      (publicUrl) =>
        createApp({
          mapsKey: 'maps',
          geocodingKey: '',
          config: stubConfig,
          adminUsername: '',
          adminPassword: '',
          targetsStore: store,
          targetsPath: dir,
          targetsPersistent: true,
          mcpApiKey: MCP_KEY,
          mcpOauthClientId: OAUTH_CLIENT_ID,
          mcpOauthClientSecret: OAUTH_CLIENT_SECRET,
          mcpPublicUrl: publicUrl,
        }),
      async ({ baseUrl }) => {
        const health = await fetch(`${baseUrl}/api/health`).then((r) => r.json());
        assert.equal(health.mcpConfigured, true);
        assert.equal(health.mcpOauthConfigured, true);

        const asMeta = await fetch(
          `${baseUrl}/.well-known/oauth-authorization-server`
        ).then((r) => r.json());
        assert.equal(asMeta.issuer, `${baseUrl}/`);
        assert.ok(asMeta.authorization_endpoint);
        assert.ok(asMeta.token_endpoint);

        const prm = await fetch(
          `${baseUrl}/.well-known/oauth-protected-resource/mcp`
        ).then((r) => r.json());
        assert.equal(prm.resource, `${baseUrl}/mcp`);
        assert.deepEqual(prm.authorization_servers, [`${baseUrl}/`]);

        const unauth = await fetch(`${baseUrl}/mcp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'initialize',
            id: 1,
            params: {},
          }),
        });
        assert.equal(unauth.status, 401);
        const www = unauth.headers.get('www-authenticate') || '';
        assert.match(www, /resource_metadata=/);

        const { verifier, challenge } = makePkce();
        const redirectUri = 'https://claude.ai/api/mcp/auth_callback';
        const authUrl = new URL('/authorize', baseUrl);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('client_id', OAUTH_CLIENT_ID);
        authUrl.searchParams.set('redirect_uri', redirectUri);
        authUrl.searchParams.set('code_challenge', challenge);
        authUrl.searchParams.set('code_challenge_method', 'S256');
        authUrl.searchParams.set('state', 'test-state');
        authUrl.searchParams.set('resource', `${baseUrl}/mcp`);

        const authRes = await fetch(authUrl, { redirect: 'manual' });
        assert.equal(authRes.status, 302);
        const location = authRes.headers.get('location');
        assert.ok(location);
        const redirected = new URL(location);
        assert.equal(redirected.origin + redirected.pathname, redirectUri);
        assert.equal(redirected.searchParams.get('state'), 'test-state');
        const code = redirected.searchParams.get('code');
        assert.ok(code);

        const tokenRes = await fetch(`${baseUrl}/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            code_verifier: verifier,
            redirect_uri: redirectUri,
            client_id: OAUTH_CLIENT_ID,
            client_secret: OAUTH_CLIENT_SECRET,
            resource: `${baseUrl}/mcp`,
          }),
        });
        assert.equal(tokenRes.status, 200);
        const tokens = await tokenRes.json();
        assert.ok(tokens.access_token);
        assert.equal(tokens.token_type.toLowerCase(), 'bearer');

        const transport = new StreamableHTTPClientTransport(
          new URL(`${baseUrl}/mcp`),
          {
            requestInit: {
              headers: {
                Authorization: `Bearer ${tokens.access_token}`,
              },
            },
          }
        );
        const client = new Client({ name: 'oauth-test', version: '1.0.0' });
        await client.connect(transport);
        try {
          const listed = parseToolJson(
            await client.callTool({ name: 'list_targets', arguments: {} })
          );
          assert.equal(listed.targets.length, 1);
        } finally {
          await client.close();
        }

        const apiKeyTransport = new StreamableHTTPClientTransport(
          new URL(`${baseUrl}/mcp`),
          {
            requestInit: {
              headers: { Authorization: `Bearer ${MCP_KEY}` },
            },
          }
        );
        const apiKeyClient = new Client({
          name: 'api-key-test',
          version: '1.0.0',
        });
        await apiKeyClient.connect(apiKeyTransport);
        try {
          const tools = await apiKeyClient.listTools();
          assert.ok(tools.tools.some((t) => t.name === 'list_targets'));
        } finally {
          await apiKeyClient.close();
        }
      }
    );
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
