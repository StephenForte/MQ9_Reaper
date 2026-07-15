/**
 * Mount Streamable HTTP MCP routes on the Express app.
 */

import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { requireMcpAuth } from './auth.js';
import { createTargetsMcpServer } from './server.js';

/**
 * @typedef {ReturnType<import('../targets-store.js').createTargetsStore>} TargetsStore
 */

/**
 * @param {import('express').Express} app
 * @param {{
 *   targetsStore: TargetsStore,
 *   mcpAuth: { configured: boolean, apiKey: string },
 * }} opts
 */
export function mountMcpRoutes(app, opts) {
  const { targetsStore, mcpAuth } = opts;
  const mcpJson = express.json({ limit: '256kb' });
  const auth = requireMcpAuth(mcpAuth);

  /**
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async function handleMcpPost(req, res) {
    const server = createTargetsMcpServer(targetsStore);
    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      res.on('close', () => {
        void transport.close();
        void server.close();
      });
    } catch (err) {
      console.error('MCP request error:', err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
      void server.close();
    }
  }

  app.post('/mcp', auth, mcpJson, (req, res) => {
    void handleMcpPost(req, res);
  });

  // Stateless mode: no SSE stream or session teardown.
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
