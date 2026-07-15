/**
 * MCP bearer + OAuth auth helpers.
 */

import { timingSafeEqualString } from '../admin-session.js';
import { createMcpOAuthProvider } from './oauth-provider.js';

export const MCP_API_KEY_MIN_LENGTH = 16;
export const MCP_OAUTH_SECRET_MIN_LENGTH = 16;

/**
 * @param {{
 *   apiKey?: string,
 *   oauthClientId?: string,
 *   oauthClientSecret?: string,
 *   publicUrl?: string,
 *   warn?: (message: string) => void,
 * }} [opts]
 */
export function resolveMcpAuth(opts = {}) {
  const warn = opts.warn || ((message) => console.warn(message));
  const apiKey = typeof opts.apiKey === 'string' ? opts.apiKey.trim() : '';
  const oauthClientId =
    typeof opts.oauthClientId === 'string' ? opts.oauthClientId.trim() : '';
  const oauthClientSecret =
    typeof opts.oauthClientSecret === 'string'
      ? opts.oauthClientSecret.trim()
      : '';
  const publicUrl =
    typeof opts.publicUrl === 'string' ? opts.publicUrl.trim().replace(/\/$/, '') : '';

  if (!apiKey) {
    return {
      configured: false,
      oauthConfigured: false,
      apiKey: '',
      oauthClientId: '',
      oauthClientSecret: '',
      publicUrl: '',
      reason: 'MCP_API_KEY not set',
      oauthReason: null,
    };
  }

  if (apiKey.length < MCP_API_KEY_MIN_LENGTH) {
    warn(
      `Warning: MCP_API_KEY must be at least ${MCP_API_KEY_MIN_LENGTH} characters — MCP stays disabled.`
    );
    return {
      configured: false,
      oauthConfigured: false,
      apiKey: '',
      oauthClientId: '',
      oauthClientSecret: '',
      publicUrl: '',
      reason: `MCP_API_KEY shorter than ${MCP_API_KEY_MIN_LENGTH} characters`,
      oauthReason: null,
    };
  }

  let oauthConfigured = false;
  /** @type {string | null} */
  let oauthReason = null;

  if (oauthClientId || oauthClientSecret) {
    if (!oauthClientId || !oauthClientSecret) {
      oauthReason =
        'Set both MCP_OAUTH_CLIENT_ID and MCP_OAUTH_CLIENT_SECRET to enable OAuth';
      warn(`Warning: ${oauthReason} — Claude connector OAuth stays disabled.`);
    } else if (oauthClientSecret.length < MCP_OAUTH_SECRET_MIN_LENGTH) {
      oauthReason = `MCP_OAUTH_CLIENT_SECRET shorter than ${MCP_OAUTH_SECRET_MIN_LENGTH} characters`;
      warn(`Warning: ${oauthReason} — Claude connector OAuth stays disabled.`);
    } else if (!publicUrl) {
      oauthReason =
        'MCP_PUBLIC_URL (or RENDER_EXTERNAL_URL) required for OAuth discovery metadata';
      warn(`Warning: ${oauthReason} — Claude connector OAuth stays disabled.`);
    } else {
      try {
        const parsed = new URL(publicUrl);
        if (
          parsed.protocol !== 'https:' &&
          parsed.hostname !== 'localhost' &&
          parsed.hostname !== '127.0.0.1'
        ) {
          oauthReason = 'MCP_PUBLIC_URL must be https (or localhost for tests)';
          warn(`Warning: ${oauthReason} — Claude connector OAuth stays disabled.`);
        } else {
          oauthConfigured = true;
        }
      } catch {
        oauthReason = 'MCP_PUBLIC_URL is not a valid URL';
        warn(`Warning: ${oauthReason} — Claude connector OAuth stays disabled.`);
      }
    }
  } else {
    oauthReason = 'MCP_OAUTH_CLIENT_ID / MCP_OAUTH_CLIENT_SECRET not set';
  }

  return {
    configured: true,
    oauthConfigured,
    apiKey,
    oauthClientId: oauthConfigured ? oauthClientId : '',
    oauthClientSecret: oauthConfigured ? oauthClientSecret : '',
    publicUrl: oauthConfigured ? publicUrl : publicUrl || '',
    reason: null,
    oauthReason,
  };
}

/**
 * Resolve public base URL for OAuth issuer metadata.
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function resolveMcpPublicUrl(env = process.env) {
  const fromEnv =
    (typeof env.MCP_PUBLIC_URL === 'string' && env.MCP_PUBLIC_URL.trim()) ||
    (typeof env.RENDER_EXTERNAL_URL === 'string' &&
      env.RENDER_EXTERNAL_URL.trim()) ||
    '';
  return fromEnv.replace(/\/$/, '');
}

/**
 * @param {string | undefined} authorizationHeader
 * @param {string} expectedKey
 * @returns {boolean}
 */
export function bearerMatches(authorizationHeader, expectedKey) {
  if (typeof authorizationHeader !== 'string' || !expectedKey) {
    return false;
  }
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  if (!match) return false;
  return timingSafeEqualString(match[1].trim(), expectedKey);
}

/**
 * @param {string | undefined} authorizationHeader
 * @returns {string | null}
 */
export function extractBearerToken(authorizationHeader) {
  if (typeof authorizationHeader !== 'string') return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  return match ? match[1].trim() : null;
}

/**
 * Verifier that accepts OAuth access tokens or the static MCP_API_KEY.
 * @param {{
 *   apiKey: string,
 *   oauthProvider?: import('@modelcontextprotocol/sdk/server/auth/provider.js').OAuthServerProvider | null,
 * }} opts
 * @returns {import('@modelcontextprotocol/sdk/server/auth/provider.js').OAuthTokenVerifier}
 */
export function createMcpTokenVerifier(opts) {
  return {
    async verifyAccessToken(token) {
      if (opts.apiKey && timingSafeEqualString(token, opts.apiKey)) {
        // Far-future expiry — SDK requireBearerAuth requires expiresAt.
        return {
          token,
          clientId: 'mcp-api-key',
          scopes: ['mcp:tools'],
          expiresAt: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
        };
      }
      if (opts.oauthProvider) {
        return opts.oauthProvider.verifyAccessToken(token);
      }
      throw new Error('Invalid or expired token');
    },
  };
}

/**
 * Build OAuth provider when configured.
 * @param {{
 *   configured: boolean,
 *   oauthConfigured: boolean,
 *   oauthClientId: string,
 *   oauthClientSecret: string,
 *   publicUrl: string,
 * }} auth
 */
export function buildMcpOAuthProvider(auth) {
  if (!auth.oauthConfigured) return null;
  const mcpResource = new URL('/mcp', `${auth.publicUrl}/`);
  return createMcpOAuthProvider({
    clientId: auth.oauthClientId,
    clientSecret: auth.oauthClientSecret,
    validateResource: (resource) => {
      if (!resource) return true;
      return resource.href.replace(/\/$/, '') === mcpResource.href.replace(/\/$/, '');
    },
  });
}

/**
 * Express middleware: 503 if MCP not configured; 401 if bearer missing/wrong.
 * Prefer requireBearerAuth from the SDK when OAuth is enabled (WWW-Authenticate).
 * @param {{ configured: boolean, apiKey: string }} auth
 */
export function requireMcpAuth(auth) {
  /**
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  return function mcpAuthMiddleware(req, res, next) {
    if (!auth.configured) {
      return res.status(503).json({
        error:
          'MCP is not configured. Set MCP_API_KEY (16+ characters) on the server.',
      });
    }
    if (!bearerMatches(req.get('authorization') || '', auth.apiKey)) {
      return res.status(401).json({ error: 'Valid Bearer MCP_API_KEY required.' });
    }
    return next();
  };
}
