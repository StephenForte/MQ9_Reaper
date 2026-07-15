/**
 * In-memory OAuth 2.1 provider for Claude/Cursor MCP connectors.
 * Pre-registers a confidential client (MCP_OAUTH_CLIENT_ID / SECRET).
 * Auto-approves authorize for the known client (PKCE + client_secret gate the token).
 */

import { randomUUID } from 'node:crypto';

/** Claude.ai / Desktop / Cowork / mobile callback (fixed by Anthropic). */
export const CLAUDE_MCP_REDIRECT_URI =
  'https://claude.ai/api/mcp/auth_callback';

/** Claude Code loopback templates (port-agnostic match in SDK). */
export const CLAUDE_CODE_REDIRECT_URIS = [
  'http://localhost/callback',
  'http://127.0.0.1/callback',
];

export const MCP_OAUTH_SCOPES = ['mcp:tools'];

const ACCESS_TTL_SEC = 3600;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * @param {{ clientId: string, clientSecret: string }} opts
 */
export function createStaticClientsStore(opts) {
  const client = {
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_secret_expires_at: 0,
    redirect_uris: [CLAUDE_MCP_REDIRECT_URI, ...CLAUDE_CODE_REDIRECT_URIS],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'client_secret_post',
    client_name: 'MQ9 Reaper MCP',
  };

  return {
    /**
     * @param {string} clientId
     */
    async getClient(clientId) {
      if (clientId === client.client_id) return { ...client };
      return undefined;
    },
  };
}

/**
 * @param {{
 *   clientId: string,
 *   clientSecret: string,
 *   validateResource?: (resource?: URL) => boolean,
 * }} opts
 * @returns {import('@modelcontextprotocol/sdk/server/auth/provider.js').OAuthServerProvider}
 */
export function createMcpOAuthProvider(opts) {
  const clientsStore = createStaticClientsStore(opts);
  /** @type {Map<string, { client: import('@modelcontextprotocol/sdk/shared/auth.js').OAuthClientInformationFull, params: import('@modelcontextprotocol/sdk/server/auth/provider.js').AuthorizationParams }>} */
  const codes = new Map();
  /** @type {Map<string, { token: string, clientId: string, scopes: string[], expiresAt: number, resource?: URL, type: 'access' | 'refresh', accessToken?: string }>} */
  const tokens = new Map();

  return {
    get clientsStore() {
      return clientsStore;
    },

    async authorize(client, params, res) {
      const code = randomUUID();
      codes.set(code, { client, params });

      const searchParams = new URLSearchParams({ code });
      if (params.state !== undefined) {
        searchParams.set('state', params.state);
      }
      const targetUrl = new URL(params.redirectUri);
      targetUrl.search = searchParams.toString();
      res.redirect(targetUrl.toString());
    },

    async challengeForAuthorizationCode(client, authorizationCode) {
      const codeData = codes.get(authorizationCode);
      if (!codeData) {
        throw new Error('Invalid authorization code');
      }
      if (codeData.client.client_id !== client.client_id) {
        throw new Error('Authorization code was not issued to this client');
      }
      return codeData.params.codeChallenge;
    },

    async exchangeAuthorizationCode(
      client,
      authorizationCode,
      _codeVerifier,
      _redirectUri,
      resource
    ) {
      const codeData = codes.get(authorizationCode);
      if (!codeData) {
        throw new Error('Invalid authorization code');
      }
      if (codeData.client.client_id !== client.client_id) {
        throw new Error('Authorization code was not issued to this client');
      }
      const resourceToCheck = resource || codeData.params.resource;
      if (opts.validateResource && !opts.validateResource(resourceToCheck)) {
        throw new Error(`Invalid resource: ${resourceToCheck}`);
      }

      codes.delete(authorizationCode);

      const scopes = codeData.params.scopes?.length
        ? codeData.params.scopes
        : MCP_OAUTH_SCOPES;
      const accessToken = randomUUID();
      const refreshToken = randomUUID();
      const expiresAtMs = Date.now() + ACCESS_TTL_SEC * 1000;
      const resourceUrl = resourceToCheck;

      tokens.set(accessToken, {
        token: accessToken,
        clientId: client.client_id,
        scopes,
        expiresAt: expiresAtMs,
        resource: resourceUrl,
        type: 'access',
      });
      tokens.set(refreshToken, {
        token: refreshToken,
        clientId: client.client_id,
        scopes,
        expiresAt: Date.now() + REFRESH_TTL_MS,
        resource: resourceUrl,
        type: 'refresh',
        accessToken,
      });

      return {
        access_token: accessToken,
        token_type: 'bearer',
        expires_in: ACCESS_TTL_SEC,
        refresh_token: refreshToken,
        scope: scopes.join(' '),
      };
    },

    async exchangeRefreshToken(client, refreshToken, scopes, resource) {
      const existing = tokens.get(refreshToken);
      if (
        !existing ||
        existing.type !== 'refresh' ||
        existing.expiresAt < Date.now() ||
        existing.clientId !== client.client_id
      ) {
        throw new Error('Invalid refresh token');
      }

      if (existing.accessToken) {
        tokens.delete(existing.accessToken);
      }

      const nextScopes = scopes?.length ? scopes : existing.scopes;
      const resourceUrl = resource || existing.resource;
      if (opts.validateResource && !opts.validateResource(resourceUrl)) {
        throw new Error(`Invalid resource: ${resourceUrl}`);
      }

      const accessToken = randomUUID();
      const expiresAtMs = Date.now() + ACCESS_TTL_SEC * 1000;
      tokens.set(accessToken, {
        token: accessToken,
        clientId: client.client_id,
        scopes: nextScopes,
        expiresAt: expiresAtMs,
        resource: resourceUrl,
        type: 'access',
      });
      existing.accessToken = accessToken;
      tokens.set(refreshToken, existing);

      return {
        access_token: accessToken,
        token_type: 'bearer',
        expires_in: ACCESS_TTL_SEC,
        refresh_token: refreshToken,
        scope: nextScopes.join(' '),
      };
    },

    async verifyAccessToken(token) {
      const tokenData = tokens.get(token);
      if (
        !tokenData ||
        tokenData.type !== 'access' ||
        !tokenData.expiresAt ||
        tokenData.expiresAt < Date.now()
      ) {
        throw new Error('Invalid or expired token');
      }
      return {
        token,
        clientId: tokenData.clientId,
        scopes: tokenData.scopes,
        expiresAt: Math.floor(tokenData.expiresAt / 1000),
        resource: tokenData.resource,
      };
    },

    async revokeToken(client, request) {
      const token = request.token;
      const data = tokens.get(token);
      if (!data || data.clientId !== client.client_id) return;
      tokens.delete(token);
      if (data.type === 'refresh' && data.accessToken) {
        tokens.delete(data.accessToken);
      }
    },
  };
}
