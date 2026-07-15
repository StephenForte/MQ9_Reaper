/**
 * MCP server for the saved target-JSON library (read + create).
 */

import * as z from 'zod/v4';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { isValidTargetId } from '../targets-store.js';

/**
 * @typedef {ReturnType<import('../targets-store.js').createTargetsStore>} TargetsStore
 */

/**
 * @param {unknown[]} items
 */
function textJson(items) {
  return {
    content: [
      {
        type: /** @type {'text'} */ ('text'),
        text: JSON.stringify(items.length === 1 ? items[0] : items, null, 2),
      },
    ],
  };
}

/**
 * @param {string} message
 */
function toolError(message) {
  return {
    isError: true,
    content: [{ type: /** @type {'text'} */ ('text'), text: message }],
  };
}

/**
 * @param {TargetsStore} store
 * @param {{ category?: string, titleContains?: string }} [filters]
 */
export function filterTargetList(store, filters = {}) {
  const category =
    typeof filters.category === 'string' ? filters.category.trim().toLowerCase() : '';
  const titleContains =
    typeof filters.titleContains === 'string'
      ? filters.titleContains.trim().toLowerCase()
      : '';

  return store.list().filter((item) => {
    if (category && String(item.category || '').toLowerCase() !== category) {
      return false;
    }
    if (
      titleContains &&
      !String(item.title || '').toLowerCase().includes(titleContains)
    ) {
      return false;
    }
    return true;
  });
}

/**
 * @param {TargetsStore} store
 */
export function summarizeTargetLibrary(store) {
  const items = store.list();
  /** @type {Record<string, number>} */
  const byCategory = {};
  let invalidCount = 0;
  /** @type {string | null} */
  let oldest = null;
  /** @type {string | null} */
  let newest = null;

  for (const item of items) {
    if (item.invalid) {
      invalidCount += 1;
    }
    const cat = item.category || '(uncategorized)';
    byCategory[cat] = (byCategory[cat] || 0) + 1;
    const created = typeof item.createdAt === 'string' ? item.createdAt : '';
    if (created) {
      if (!oldest || created < oldest) oldest = created;
      if (!newest || created > newest) newest = created;
    }
  }

  return {
    total: items.length,
    invalidCount,
    byCategory,
    oldestCreatedAt: oldest,
    newestCreatedAt: newest,
  };
}

/**
 * @param {TargetsStore} store
 * @returns {McpServer}
 */
export function createTargetsMcpServer(store) {
  const server = new McpServer({
    name: 'mq9-reaper-targets',
    version: '1.0.0',
  });

  server.registerTool(
    'list_targets',
    {
      title: 'List targets',
      description:
        'List saved target packages on the server disk (id, title, category, createdAt). Optional filters.',
      inputSchema: {
        category: z
          .string()
          .optional()
          .describe('Exact category match (case-insensitive)'),
        titleContains: z
          .string()
          .optional()
          .describe('Substring match on title (case-insensitive)'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ category, titleContains }) => {
      try {
        const targets = filterTargetList(store, { category, titleContains });
        return textJson([{ targets }]);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Could not list targets.';
        return toolError(message);
      }
    }
  );

  server.registerTool(
    'get_target',
    {
      title: 'Get target',
      description: 'Read one full §4 target JSON document by UUID id.',
      inputSchema: {
        id: z.string().describe('Target package UUID (filename stem)'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      if (!isValidTargetId(id)) {
        return toolError('Invalid target id.');
      }
      const result = store.read(id);
      if (!result.ok) {
        return toolError(result.error);
      }
      return textJson([result.document]);
    }
  );

  server.registerTool(
    'create_target',
    {
      title: 'Create target',
      description:
        'Validate and save a full §4 target JSON document (title + category required). Appears in Review and Admin.',
      inputSchema: {
        document: z
          .any()
          .describe('Full §4 target file object (version 1.0)'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ document }) => {
      const result = store.write(document);
      if (!result.ok) {
        return toolError(result.error);
      }
      return textJson([
        {
          ok: true,
          id: result.id,
          title: result.title,
          category: result.category,
          createdAt: result.createdAt,
        },
      ]);
    }
  );

  server.registerTool(
    'summarize_library',
    {
      title: 'Summarize library',
      description:
        'Aggregate counts by category, invalid count, and createdAt date range for the target library.',
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      try {
        return textJson([summarizeTargetLibrary(store)]);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Could not summarize library.';
        return toolError(message);
      }
    }
  );

  server.registerResource(
    'targets-library',
    'targets://library',
    {
      description: 'JSON list of saved target package metadata',
      mimeType: 'application/json',
    },
    async (uri) => {
      const targets = store.list();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({ targets }, null, 2),
          },
        ],
      };
    }
  );

  server.registerResource(
    'target-package',
    new ResourceTemplate('targets://{id}', {
      list: async () => ({
        resources: store
          .list()
          .filter((item) => !item.invalid)
          .map((item) => ({
            uri: `targets://${item.id}`,
            name: item.title || item.id,
            description: `${item.category || 'uncategorized'} · ${item.createdAt}`,
            mimeType: 'application/json',
          })),
      }),
    }),
    {
      description: 'One full §4 target JSON document by UUID',
      mimeType: 'application/json',
    },
    async (uri, variables) => {
      const id = typeof variables.id === 'string' ? variables.id : '';
      if (!isValidTargetId(id)) {
        throw new Error('Invalid target id.');
      }
      const result = store.read(id);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(result.document, null, 2),
          },
        ],
      };
    }
  );

  server.registerPrompt(
    'inspect_target',
    {
      title: 'Inspect target',
      description: 'Load one target package into a prompt for Q&A.',
      argsSchema: {
        id: z.string().describe('Target package UUID'),
      },
    },
    async ({ id }) => {
      if (!isValidTargetId(id)) {
        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Invalid target id: ${id}`,
              },
            },
          ],
        };
      }
      const result = store.read(id);
      if (!result.ok) {
        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Could not load target ${id}: ${result.error}`,
              },
            },
          ],
        };
      }
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: [
                'Answer questions about this MQ9 Reaper target package (schema §4).',
                'Use only the JSON below; do not invent coordinates or metadata.',
                '',
                '```json',
                JSON.stringify(result.document, null, 2),
                '```',
              ].join('\n'),
            },
          },
        ],
      };
    }
  );

  server.registerPrompt(
    'compare_targets',
    {
      title: 'Compare targets',
      description: 'Side-by-side analysis prompt for 2–5 target packages.',
      argsSchema: {
        ids: z
          .string()
          .describe('Comma-separated target UUIDs (2–5 packages)'),
      },
    },
    async ({ ids }) => {
      const idList = String(ids || '')
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean);

      if (idList.length < 2 || idList.length > 5) {
        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: 'Pass between 2 and 5 comma-separated target UUIDs.',
              },
            },
          ],
        };
      }

      /** @type {unknown[]} */
      const packages = [];
      /** @type {string[]} */
      const errors = [];
      for (const id of idList) {
        if (!isValidTargetId(id)) {
          errors.push(`${id}: invalid id`);
          continue;
        }
        const result = store.read(id);
        if (!result.ok) {
          errors.push(`${id}: ${result.error}`);
          continue;
        }
        packages.push({ id, document: result.document });
      }

      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: [
                'Compare these MQ9 Reaper target packages.',
                'Cover title/category, center/radius, selection count, priorities, and notable differences.',
                errors.length ? `Load errors:\n${errors.join('\n')}` : '',
                '',
                '```json',
                JSON.stringify(packages, null, 2),
                '```',
              ]
                .filter(Boolean)
                .join('\n'),
            },
          },
        ],
      };
    }
  );

  server.registerPrompt(
    'draft_target_package',
    {
      title: 'Draft target package',
      description:
        'Guide producing valid §4 JSON, then call create_target to save it.',
      argsSchema: {
        title: z.string().optional().describe('Suggested package title'),
        category: z.string().optional().describe('Suggested category'),
        notes: z
          .string()
          .optional()
          .describe('Operator notes / constraints for the draft'),
      },
    },
    async ({ title, category, notes }) => {
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: [
                'Draft a valid MQ9 Reaper target JSON file (schema version "1.0").',
                'Required top-level fields: version, createdAt (ISO-8601), title, category,',
                'center { lat, lng, source: address|click|latlng }, radiusMiles (>0),',
                'generation { dotCount, requiredSelections, seed: null },',
                'targets[] with id (t-01…), name, lat, lng, confidence (1–5), priority (low|medium|high|critical).',
                'targets.length must equal generation.requiredSelections.',
                'When ready, call the create_target tool with the full document object.',
                title ? `Suggested title: ${title}` : '',
                category ? `Suggested category: ${category}` : '',
                notes ? `Notes: ${notes}` : '',
              ]
                .filter(Boolean)
                .join('\n'),
            },
          },
        ],
      };
    }
  );

  return server;
}
