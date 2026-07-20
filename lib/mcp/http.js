/**
 * Mount Streamable HTTP MCP routes (+ optional OAuth AS) on the Express app.
 */

import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  getOAuthProtectedResourceMetadataUrl,
  mcpAuthRouter,
} from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import {
  buildMcpOAuthProvider,
  createMcpTokenVerifier,
  requireMcpAuth,
} from './auth.js';
import { MCP_OAUTH_SCOPES } from './oauth-provider.js';
import { createTargetsMcpServer } from './server.js';

/**
 * @typedef {ReturnType<import('../targets-store.js').createTargetsStore>} TargetsStore
 */

/**
 * @param {import('express').Express} app
 * @param {{
 *   targetsStore: TargetsStore,
 *   mcpAuth: ReturnType<import('./auth.js').resolveMcpAuth>,
 *   oauthProvider?: import('@modelcontextprotocol/sdk/server/auth/provider.js').OAuthServerProvider | null,
 * }} opts
 */
export function mountMcpRoutes(app, opts) {
  const { targetsStore, mcpAuth } = opts;
  const mcpJson = express.json({ limit: '256kb' });
  const oauthProvider =
    opts.oauthProvider !== undefined
      ? opts.oauthProvider
      : buildMcpOAuthProvider(mcpAuth);

  /** @type {import('express').RequestHandler} */
  let auth;

  if (!mcpAuth.configured) {
    auth = requireMcpAuth(mcpAuth);
  } else if (mcpAuth.oauthConfigured && oauthProvider && mcpAuth.publicUrl) {
    const issuerUrl = new URL(mcpAuth.publicUrl);
    const mcpServerUrl = new URL('/mcp', `${mcpAuth.publicUrl}/`);

    // ChatGPT may send a per-app callback
    // (https://chatgpt.com/connector/oauth/{id}). The SDK requires exact
    // registration — remember allowed ChatGPT callbacks before /authorize runs.
    app.use('/authorize', (req, _res, next) => {
      const store = oauthProvider.clientsStore;
      if (
        store &&
        typeof store.rememberAllowedRedirectUri === 'function'
      ) {
        const redirectUri =
          typeof req.query.redirect_uri === 'string'
            ? req.query.redirect_uri
            : undefined;
        store.rememberAllowedRedirectUri(redirectUri);
      }
      next();
    });

    app.use(
      mcpAuthRouter({
        provider: oauthProvider,
        issuerUrl,
        baseUrl: issuerUrl,
        resourceServerUrl: mcpServerUrl,
        scopesSupported: MCP_OAUTH_SCOPES,
        resourceName: 'MQ9 Reaper Targets',
      })
    );

    const verifier = createMcpTokenVerifier({
      apiKey: mcpAuth.apiKey,
      oauthProvider,
    });
    const bearer = requireBearerAuth({
      verifier,
      requiredScopes: [],
      resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpServerUrl),
    });

    auth = (req, res, next) => {
      if (!mcpAuth.configured) {
        return res.status(503).json({
          error:
            'MCP is not configured. Set MCP_API_KEY (16+ characters) on the server.',
        });
      }
      return bearer(req, res, next);
    };
  } else {
    auth = requireMcpAuth(mcpAuth);
  }

  /**
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async function handleMcpPost(req, res) {
    const server = createTargetsMcpServer(targetsStore);
    /** @type {InstanceType<typeof StreamableHTTPServerTransport> | undefined} */
    let transport;
    try {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error('MCP request error:', err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    } finally {
      if (transport) {
        void transport.close();
      }
      void server.close();
    }
  }

  app.post('/mcp', auth, mcpJson, (req, res) => {
    void handleMcpPost(req, res);
  });

  app.get('/mcp', auth, (_req, res) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed.' },
      id: null,
    });
  });

  app.delete('/mcp', auth, (_req, res) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed.' },
      id: null,
    });
  });
}
