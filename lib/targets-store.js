/**
 * Persistent target-JSON store on disk (Render /var/data/targets or local data/targets).
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeTargetFileMeta,
  validateFileMeta,
  validateTargetFile,
} from '../public/js/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const REPO_TARGETS_DIR = path.join(REPO_ROOT, 'data', 'targets');
const REPO_CONFIG_MD = path.join(REPO_ROOT, 'config', 'app-config.md');
const DEFAULT_PERSISTENT_DIR = '/var/data';
const DEFAULT_PERSISTENT_TARGETS = path.join(DEFAULT_PERSISTENT_DIR, 'targets');

/** UUID v4 filename stem — rejects path traversal. */
export const TARGET_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * @param {string} id
 * @returns {boolean}
 */
export function isValidTargetId(id) {
  return typeof id === 'string' && TARGET_ID_RE.test(id);
}

/**
 * Resolve where saved target JSON files live.
 * Priority: TARGETS_PATH → dirname(CONFIG_PATH)/targets when persistent → /var/data/targets → repo data/targets.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @param {{ persistentDirExists?: (dir: string) => boolean }} [opts]
 * @returns {{ path: string, persistent: boolean, source: 'env' | 'config-dir' | 'disk' | 'repo' }}
 */
export function resolveTargetsPath(env = process.env, opts = {}) {
  const dirExists =
    opts.persistentDirExists ||
    ((dir) => {
      try {
        return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
      } catch {
        return false;
      }
    });

  const fromEnv =
    typeof env.TARGETS_PATH === 'string' ? env.TARGETS_PATH.trim() : '';
  if (fromEnv) {
    const resolved = path.resolve(fromEnv);
    const persistent =
      path.resolve(resolved) !== path.resolve(REPO_TARGETS_DIR);
    return { path: resolved, persistent, source: 'env' };
  }

  const configPath =
    typeof env.CONFIG_PATH === 'string' ? env.CONFIG_PATH.trim() : '';
  if (configPath) {
    const resolvedConfig = path.resolve(configPath);
    if (resolvedConfig !== path.resolve(REPO_CONFIG_MD)) {
      return {
        path: path.join(path.dirname(resolvedConfig), 'targets'),
        persistent: true,
        source: 'config-dir',
      };
    }
  }

  if (dirExists(DEFAULT_PERSISTENT_DIR)) {
    return {
      path: DEFAULT_PERSISTENT_TARGETS,
      persistent: true,
      source: 'disk',
    };
  }

  return { path: REPO_TARGETS_DIR, persistent: false, source: 'repo' };
}

/**
 * @param {string} dirPath
 */
export function ensureTargetsDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * @param {string} dirPath
 * @param {string} id
 * @returns {string}
 */
function filePathForId(dirPath, id) {
  if (!isValidTargetId(id)) {
    throw new Error('Invalid target id.');
  }
  return path.join(dirPath, `${id}.json`);
}

/**
 * @param {string} filePath
 * @param {unknown} document
 */
function atomicWriteJson(filePath, document) {
  const dir = path.dirname(filePath);
  ensureTargetsDir(dir);
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

/**
 * @typedef {{
 *   id: string,
 *   title: string,
 *   category: string,
 *   createdAt: string,
 *   filename: string,
 * }} TargetListItem
 */

/**
 * @typedef {{
 *   list: () => TargetListItem[],
 *   read: (id: string) => { ok: true, document: import('../public/js/schema.js').TargetFile } | { ok: false, error: string, status: number },
 *   write: (raw: unknown) => { ok: true, id: string, title: string, category: string, createdAt: string } | { ok: false, error: string, status: number },
 *   updateMeta: (id: string, patch: { title?: unknown, category?: unknown }) => { ok: true, id: string, title: string, category: string, createdAt: string } | { ok: false, error: string, status: number },
 *   delete: (id: string) => { ok: true } | { ok: false, error: string, status: number },
 *   deleteMany: (ids: string[]) => { ok: true, deleted: string[] } | { ok: false, error: string, status: number },
 *   getPath: () => string,
 * }} TargetsStore
 */

/**
 * @param {string} dirPath
 * @returns {TargetsStore}
 */
export function createTargetsStore(dirPath) {
  ensureTargetsDir(dirPath);

  /**
   * @param {string} id
   */
  function readRaw(id) {
    if (!isValidTargetId(id)) {
      return { ok: false, error: 'Invalid target id.', status: 400 };
    }
    const filePath = filePathForId(dirPath, id);
    if (!fs.existsSync(filePath)) {
      return { ok: false, error: 'Target file not found.', status: 404 };
    }
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      return { ok: false, error: 'Stored file is not valid JSON.', status: 500 };
    }
    const validated = validateTargetFile(raw);
    if (!validated.ok) {
      return {
        ok: false,
        error: `Stored file failed schema validation: ${validated.message}`,
        status: 500,
      };
    }
    return { ok: true, document: validated.document, filePath };
  }

  return {
    getPath() {
      return dirPath;
    },

    list() {
      ensureTargetsDir(dirPath);
      /** @type {TargetListItem[]} */
      const items = [];
      let names;
      try {
        names = fs.readdirSync(dirPath);
      } catch {
        return items;
      }
      for (const name of names) {
        if (!name.endsWith('.json')) continue;
        const id = name.slice(0, -'.json'.length);
        if (!isValidTargetId(id)) continue;
        const result = readRaw(id);
        if (!result.ok) continue;
        const meta = normalizeTargetFileMeta(result.document, {
          fallbackTitle: name,
        });
        items.push({
          id,
          title: meta.title,
          category: meta.category,
          createdAt: result.document.createdAt,
          filename: name,
        });
      }
      items.sort((a, b) => {
        if (a.createdAt === b.createdAt) return a.id < b.id ? 1 : -1;
        return a.createdAt < b.createdAt ? 1 : -1;
      });
      return items;
    },

    read(id) {
      const result = readRaw(id);
      if (!result.ok) {
        return { ok: false, error: result.error, status: result.status };
      }
      return { ok: true, document: result.document };
    },

    write(raw) {
      const meta = validateFileMeta(
        raw && typeof raw === 'object' && !Array.isArray(raw)
          ? /** @type {{ title?: unknown, category?: unknown }} */ (raw)
          : {}
      );
      if (!meta.ok) {
        return { ok: false, error: meta.message, status: 400 };
      }
      const validated = validateTargetFile(raw);
      if (!validated.ok) {
        return { ok: false, error: validated.message, status: 400 };
      }
      const document = {
        ...validated.document,
        title: meta.title,
        category: meta.category,
      };
      const id = crypto.randomUUID();
      try {
        atomicWriteJson(filePathForId(dirPath, id), document);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Could not write target file.';
        return { ok: false, error: message, status: 503 };
      }
      return {
        ok: true,
        id,
        title: document.title,
        category: document.category,
        createdAt: document.createdAt,
      };
    },

    updateMeta(id, patch) {
      const result = readRaw(id);
      if (!result.ok) {
        return { ok: false, error: result.error, status: result.status };
      }
      const current = normalizeTargetFileMeta(result.document, {
        fallbackTitle: 'Untitled',
      });
      const nextTitle =
        patch.title !== undefined ? patch.title : current.title;
      const nextCategory =
        patch.category !== undefined ? patch.category : current.category;
      const meta = validateFileMeta({
        title: nextTitle,
        category: nextCategory,
      });
      if (!meta.ok) {
        return { ok: false, error: meta.message, status: 400 };
      }
      const document = {
        ...result.document,
        title: meta.title,
        category: meta.category,
      };
      try {
        atomicWriteJson(result.filePath, document);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Could not update target file.';
        return { ok: false, error: message, status: 503 };
      }
      return {
        ok: true,
        id,
        title: document.title,
        category: document.category,
        createdAt: document.createdAt,
      };
    },

    delete(id) {
      if (!isValidTargetId(id)) {
        return { ok: false, error: 'Invalid target id.', status: 400 };
      }
      const filePath = filePathForId(dirPath, id);
      if (!fs.existsSync(filePath)) {
        return { ok: false, error: 'Target file not found.', status: 404 };
      }
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Could not delete target file.';
        return { ok: false, error: message, status: 503 };
      }
      return { ok: true };
    },

    deleteMany(ids) {
      if (!Array.isArray(ids) || ids.length === 0) {
        return { ok: false, error: 'Pass a non-empty ids array.', status: 400 };
      }
      /** @type {string[]} */
      const deleted = [];
      for (const id of ids) {
        const result = this.delete(id);
        if (!result.ok && result.status === 400) {
          return result;
        }
        if (result.ok) deleted.push(id);
      }
      return { ok: true, deleted };
    },
  };
}

/**
 * Bootstrap store from env (call once at process start when not injecting).
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @param {{ persistentDirExists?: (dir: string) => boolean }} [opts]
 * @returns {{ store: TargetsStore, path: string, persistent: boolean, source: string }}
 */
export function bootstrapTargetsStore(env = process.env, opts = {}) {
  const resolved = resolveTargetsPath(env, opts);
  ensureTargetsDir(resolved.path);
  return {
    store: createTargetsStore(resolved.path),
    path: resolved.path,
    persistent: resolved.persistent,
    source: resolved.source,
  };
}
