/**
 * MCP bearer auth — gate remote /mcp with MCP_API_KEY.
 */

import { timingSafeEqualString } from '../admin-session.js';

export const MCP_API_KEY_MIN_LENGTH = 16;

/**
 * @param {{
 *   apiKey?: string,
 *   warn?: (message: string) => void,
 * }} [opts]
 * @returns {{
 *   configured: boolean,
 *   apiKey: string,
 *   reason: string | null,
 * }}
 */
export function resolveMcpAuth(opts = {}) {
  const warn = opts.warn || ((message) => console.warn(message));
  const apiKey = typeof opts.apiKey === 'string' ? opts.apiKey.trim() : '';

  if (!apiKey) {
    return {
      configured: false,
      apiKey: '',
      reason: 'MCP_API_KEY not set',
    };
  }

  if (apiKey.length < MCP_API_KEY_MIN_LENGTH) {
    warn(
      `Warning: MCP_API_KEY must be at least ${MCP_API_KEY_MIN_LENGTH} characters — MCP stays disabled.`
    );
    return {
      configured: false,
      apiKey: '',
      reason: `MCP_API_KEY shorter than ${MCP_API_KEY_MIN_LENGTH} characters`,
    };
  }

  return { configured: true, apiKey, reason: null };
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
 * Express middleware: 503 if MCP not configured; 401 if bearer missing/wrong.
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
