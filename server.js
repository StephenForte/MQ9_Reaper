import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express from 'express';
import {
  bootstrapAppConfig,
  defaultsForClient,
  getAppConfig,
  getConfigPath,
  isConfigPersistent,
  mergeAdminConfigPatch,
  setAppConfig,
  writeAppConfig,
} from './config.js';
import {
  ADMIN_COOKIE,
  ADMIN_PASSWORD_MIN_LENGTH,
  credentialsMatch,
  createSessionToken,
  parseCookies,
  requestIsSecure,
  resolveAdminAuth,
  sessionClearCookieHeader,
  sessionSetCookieHeader,
  verifySessionToken,
} from './lib/admin-session.js';
import { createLoginRateLimiter } from './lib/login-rate-limit.js';
import { geocodeAddress, reverseGeocode } from './lib/geocode.js';
import { queryOverpassPlaces } from './lib/overpass.js';
import {
  bootstrapTargetsStore,
  isValidTargetId,
} from './lib/targets-store.js';
import {
  MCP_API_KEY_MIN_LENGTH,
  resolveMcpAuth,
  resolveMcpPublicUrl,
} from './lib/mcp/auth.js';
import { mountMcpRoutes } from './lib/mcp/http.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * @param {{
 *   mapsKey?: string,
 *   geocodingKey?: string,
 *   config?: ReturnType<typeof getAppConfig>,
 *   configPath?: string,
 *   configPersistent?: boolean,
 *   writeConfigFn?: (config: ReturnType<typeof getAppConfig>) => void,
 *   adminUsername?: string,
 *   adminPassword?: string,
 *   adminSessionSecret?: string,
 *   loginRateLimiter?: ReturnType<typeof createLoginRateLimiter>,
 *   geocodeFn?: typeof geocodeAddress,
 *   reverseGeocodeFn?: typeof reverseGeocode,
 *   overpassFn?: typeof queryOverpassPlaces,
 *   targetsStore?: ReturnType<typeof bootstrapTargetsStore>['store'],
 *   targetsPath?: string,
 *   targetsPersistent?: boolean,
 *   mcpApiKey?: string,
 *   mcpOauthClientId?: string,
 *   mcpOauthClientSecret?: string,
 *   mcpPublicUrl?: string,
 *   warn?: (message: string) => void,
 * }} [deps]
 */
export function createApp(deps = {}) {
  const mapsKey =
    deps.mapsKey !== undefined
      ? deps.mapsKey
      : process.env.GOOGLE_MAPS_API_KEY || '';
  const geocodingKey =
    deps.geocodingKey !== undefined
      ? deps.geocodingKey
      : process.env.GEOCODING_API_KEY || '';
  /** @type {ReturnType<typeof getAppConfig>} */
  let config = deps.config !== undefined ? deps.config : getAppConfig();
  const configPath = deps.configPath || getConfigPath();
  const configPersistent =
    deps.configPersistent !== undefined
      ? deps.configPersistent
      : isConfigPersistent();
  const writeConfig =
    deps.writeConfigFn ||
    ((next) => {
      writeAppConfig(next, { path: configPath });
    });
  const geocodeFn = deps.geocodeFn || geocodeAddress;
  const reverseGeocodeFn = deps.reverseGeocodeFn || reverseGeocode;
  const overpassFn = deps.overpassFn || queryOverpassPlaces;
  const warn = deps.warn || ((message) => console.warn(message));

  const targetsBoot =
    deps.targetsStore !== undefined
      ? null
      : bootstrapTargetsStore();
  const targetsStore =
    deps.targetsStore !== undefined
      ? deps.targetsStore
      : /** @type {NonNullable<typeof targetsBoot>} */ (targetsBoot).store;
  const targetsPath =
    deps.targetsPath !== undefined
      ? deps.targetsPath
      : targetsBoot
        ? targetsBoot.path
        : targetsStore.getPath();
  const targetsPersistent =
    deps.targetsPersistent !== undefined
      ? deps.targetsPersistent
      : targetsBoot
        ? targetsBoot.persistent
        : false;

  const adminAuth = resolveAdminAuth({
    username:
      deps.adminUsername !== undefined
        ? deps.adminUsername
        : process.env.ADMIN_USERNAME || '',
    password:
      deps.adminPassword !== undefined
        ? deps.adminPassword
        : process.env.ADMIN_PASSWORD || '',
    sessionSecret:
      deps.adminSessionSecret !== undefined
        ? deps.adminSessionSecret
        : process.env.ADMIN_SESSION_SECRET || '',
    warn,
  });
  const adminConfigured = adminAuth.configured;
  const adminUsername = adminAuth.username;
  const adminPassword = adminAuth.password;
  const adminSessionSecret = adminAuth.sessionSecret;
  const loginRateLimiter =
    deps.loginRateLimiter || createLoginRateLimiter({ limit: 5, windowMs: 60_000 });

  const mcpAuth = resolveMcpAuth({
    apiKey:
      deps.mcpApiKey !== undefined
        ? deps.mcpApiKey
        : process.env.MCP_API_KEY || '',
    oauthClientId:
      deps.mcpOauthClientId !== undefined
        ? deps.mcpOauthClientId
        : process.env.MCP_OAUTH_CLIENT_ID || '',
    oauthClientSecret:
      deps.mcpOauthClientSecret !== undefined
        ? deps.mcpOauthClientSecret
        : process.env.MCP_OAUTH_CLIENT_SECRET || '',
    publicUrl:
      deps.mcpPublicUrl !== undefined
        ? deps.mcpPublicUrl
        : resolveMcpPublicUrl(),
    warn,
  });
  const mcpConfigured = mcpAuth.configured;
  const mcpOauthConfigured = mcpAuth.oauthConfigured;

  const app = express();
  // Render (and most PaaS) terminate TLS upstream — needed for Secure cookies + req.ip.
  app.set('trust proxy', 1);

  const defaultJson = express.json({ limit: '32kb' });
  const targetsJson = express.json({ limit: '256kb' });
  // Skip the default parser for POST /api/targets and /mcp so the 256kb route parsers can apply.
  // Otherwise global express.json rejects 32–256kb bodies with 413 before the route runs.
  app.use((req, res, next) => {
    if (
      req.method === 'POST' &&
      (req.path === '/api/targets' || req.path === '/mcp')
    ) {
      return next();
    }
    return defaultJson(req, res, next);
  });
  app.use(express.static(path.join(__dirname, 'public')));

  mountMcpRoutes(app, { targetsStore, mcpAuth });

  /**
   * @param {import('express').Request} req
   */
  function isAdminAuthenticated(req) {
    if (!adminConfigured) return false;
    const cookies = parseCookies(req);
    return verifySessionToken(
      cookies[ADMIN_COOKIE],
      adminUsername,
      adminSessionSecret
    );
  }

  /**
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  function requireAdmin(req, res, next) {
    if (!adminConfigured) {
      return res.status(503).json({
        error:
          'Admin is not configured. Set ADMIN_USERNAME, ADMIN_PASSWORD (12+ chars), and preferably ADMIN_SESSION_SECRET (16+ chars).',
      });
    }
    if (!isAdminAuthenticated(req)) {
      return res.status(401).json({ error: 'Admin login required.' });
    }
    return next();
  }

  /**
   * @param {import('express').Request} req
   */
  function clientKey(req) {
    return req.ip || req.socket?.remoteAddress || 'unknown';
  }

  /** Liveness for Render / local smoke checks. Use ?probe=geocode for key smoke. */
  app.get('/api/health', async (req, res) => {
    const payload = {
      ok: true,
      mapsKeyConfigured: Boolean(mapsKey),
      geocodingConfigured: Boolean(geocodingKey),
      adminConfigured,
      mcpConfigured,
      mcpOauthConfigured,
      configPersistent,
      targetsPersistent,
    };

    if (req.query.probe !== 'geocode') {
      return res.json(payload);
    }

    if (!geocodingKey) {
      return res.json({
        ...payload,
        geocodingProbe: {
          ok: false,
          error: 'GEOCODING_API_KEY is not set.',
        },
      });
    }

    try {
      const result = await geocodeFn(
        '1600 Amphitheatre Parkway, Mountain View, CA',
        geocodingKey
      );
      if (!result.ok) {
        return res.json({
          ...payload,
          geocodingProbe: {
            ok: false,
            error: result.error,
            googleStatus: result.googleStatus || null,
          },
        });
      }
      return res.json({
        ...payload,
        geocodingProbe: {
          ok: true,
          lat: result.lat,
          lng: result.lng,
        },
      });
    } catch (err) {
      console.error('Health geocode probe error:', err);
      return res.json({
        ...payload,
        geocodingProbe: {
          ok: false,
          error: 'Geocoding probe failed unexpectedly.',
        },
      });
    }
  });

  /** Public runtime config for the browser (Maps key only — never geocoding). */
  app.get('/api/config', (_req, res) => {
    res.json({
      mapsApiKey: mapsKey,
      adminConfigured,
      defaults: defaultsForClient(config),
    });
  });

  app.get('/api/targets', (_req, res) => {
    try {
      return res.json({ targets: targetsStore.list() });
    } catch (err) {
      console.error('List targets error:', err);
      return res.status(503).json({ error: 'Could not list saved targets.' });
    }
  });

  app.get('/api/targets/:id', (req, res) => {
    const id = typeof req.params.id === 'string' ? req.params.id : '';
    if (!isValidTargetId(id)) {
      return res.status(400).json({ error: 'Invalid target id.' });
    }
    const result = targetsStore.read(id);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }
    return res.json(result.document);
  });

  app.post('/api/targets', targetsJson, (req, res) => {
    const result = targetsStore.write(req.body);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }
    return res.status(201).json({
      ok: true,
      id: result.id,
      title: result.title,
      category: result.category,
      createdAt: result.createdAt,
    });
  });

  app.patch('/api/targets/:id', requireAdmin, targetsJson, (req, res) => {
    const id = typeof req.params.id === 'string' ? req.params.id : '';
    if (!isValidTargetId(id)) {
      return res.status(400).json({ error: 'Invalid target id.' });
    }
    const result = targetsStore.updateMeta(id, {
      title: req.body?.title,
      category: req.body?.category,
    });
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }
    return res.json({
      ok: true,
      id: result.id,
      title: result.title,
      category: result.category,
      createdAt: result.createdAt,
    });
  });

  app.delete('/api/targets/:id', requireAdmin, (req, res) => {
    const id = typeof req.params.id === 'string' ? req.params.id : '';
    if (!isValidTargetId(id)) {
      return res.status(400).json({ error: 'Invalid target id.' });
    }
    const result = targetsStore.delete(id);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }
    return res.json({ ok: true });
  });

  app.post('/api/admin/targets/delete', requireAdmin, targetsJson, (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : null;
    if (!ids) {
      return res.status(400).json({ error: 'Pass a non-empty ids array.' });
    }
    const result = targetsStore.deleteMany(ids);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }
    return res.json({ ok: true, deleted: result.deleted });
  });

  app.post('/api/admin/login', (req, res) => {
    if (!adminConfigured) {
      return res.status(503).json({
        error:
          'Admin is not configured. Set ADMIN_USERNAME, ADMIN_PASSWORD (12+ chars), and preferably ADMIN_SESSION_SECRET (16+ chars).',
      });
    }

    const rate = loginRateLimiter.check(clientKey(req));
    if (!rate.ok) {
      res.setHeader('Retry-After', String(rate.retryAfterSec));
      return res.status(429).json({
        error: 'Too many login attempts. Try again shortly.',
        retryAfterSec: rate.retryAfterSec,
      });
    }

    const username =
      typeof req.body?.username === 'string' ? req.body.username : '';
    const password =
      typeof req.body?.password === 'string' ? req.body.password : '';

    if (
      !credentialsMatch(username, password, adminUsername, adminPassword)
    ) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const token = createSessionToken(adminUsername, adminSessionSecret);
    const secure = requestIsSecure(req);
    res.setHeader('Set-Cookie', sessionSetCookieHeader(req, secure, token));
    return res.json({ ok: true, authenticated: true });
  });

  app.post('/api/admin/logout', (req, res) => {
    const secure = requestIsSecure(req);
    res.setHeader('Set-Cookie', sessionClearCookieHeader(secure));
    return res.json({ ok: true, authenticated: false });
  });

  app.get('/api/admin/session', (req, res) => {
    if (!adminConfigured) {
      return res.json({ adminConfigured: false, authenticated: false });
    }
    return res.json({
      adminConfigured: true,
      authenticated: isAdminAuthenticated(req),
    });
  });

  app.get('/api/admin/config', requireAdmin, (_req, res) => {
    res.json({
      defaults: defaultsForClient(config),
      editable: [
        'radiusMiles',
        'dotCount',
        'minSelections',
        'maxSelections',
        'blockExtraSelections',
        'minDotSpacingMeters',
        'mapType',
        'confirmOnRecenter',
        'defaultCenterLat',
        'defaultCenterLng',
      ],
      readOnly: ['radiusUnit', 'seededRng'],
    });
  });

  app.put('/api/admin/config', requireAdmin, (req, res) => {
    try {
      const next = mergeAdminConfigPatch(req.body, config);
      writeConfig(next);
      config = next;
      if (deps.config === undefined) {
        setAppConfig(next);
      }
      return res.json({
        ok: true,
        defaults: defaultsForClient(config),
        applyRequired: true,
        message:
          'Config saved. Click Apply & reload in Admin for this browser to use the new defaults.',
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Invalid configuration.';
      return res.status(400).json({ error: message.replace(/^config:\s*/, '') });
    }
  });

  /**
   * Server-side geocode proxy (PRD §7.3).
   * Returns only lat/lng (+ address metadata); never exposes GEOCODING_API_KEY.
   */
  app.get('/api/geocode', async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q) {
      return res.status(400).json({ error: 'Missing address. Pass ?q=...' });
    }

    if (!geocodingKey) {
      return res.status(503).json({
        error: 'Geocoding is not configured. Set GEOCODING_API_KEY on the server.',
      });
    }

    try {
      const result = await geocodeFn(q, geocodingKey);
      if (!result.ok) {
        const payload = { error: result.error };
        if (result.googleStatus) payload.status = result.googleStatus;
        return res.status(result.status).json(payload);
      }

      return res.json({
        lat: result.lat,
        lng: result.lng,
        formattedAddress: result.formattedAddress,
        addressComponents: result.addressComponents,
        types: result.types,
      });
    } catch (err) {
      console.error('Geocode proxy error:', err);
      return res.status(502).json({
        error: 'Geocoding request failed. Try again, or use map click / lat-long.',
      });
    }
  });

  /**
   * Reverse geocode proxy — region labels and per-target place names.
   */
  app.get('/api/geocode/reverse', async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'Pass numeric lat and lng query params.' });
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ error: 'lat/lng out of range.' });
    }

    if (!geocodingKey) {
      return res.status(503).json({
        error: 'Geocoding is not configured. Set GEOCODING_API_KEY on the server.',
      });
    }

    try {
      const result = await reverseGeocodeFn(lat, lng, geocodingKey);
      if (!result.ok) {
        const payload = { error: result.error };
        if (result.googleStatus) payload.status = result.googleStatus;
        return res.status(result.status).json(payload);
      }

      return res.json({
        formattedAddress: result.formattedAddress,
        addressComponents: result.addressComponents,
        types: result.types,
        results: result.results,
      });
    } catch (err) {
      console.error('Reverse geocode proxy error:', err);
      return res.status(502).json({ error: 'Reverse geocoding request failed.' });
    }
  });

  /**
   * Overpass (OpenStreetMap) proxy — real-world POI candidates inside the radius.
   * Client sends center + radius only; server builds the QL query.
   */
  app.get('/api/overpass', async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radiusMiles = Number(req.query.radiusMiles);
    const limitRaw = req.query.limit;
    const limit =
      limitRaw === undefined || limitRaw === ''
        ? undefined
        : Number(limitRaw);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res
        .status(400)
        .json({ error: 'Pass numeric lat and lng query params.' });
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ error: 'lat/lng out of range.' });
    }
    if (!Number.isFinite(radiusMiles) || !(radiusMiles > 0)) {
      return res
        .status(400)
        .json({ error: 'radiusMiles must be a number greater than 0.' });
    }
    if (limit !== undefined && (!Number.isFinite(limit) || limit < 1)) {
      return res.status(400).json({ error: 'limit must be a number ≥ 1.' });
    }

    try {
      const result = await overpassFn({
        lat,
        lng,
        radiusMiles,
        ...(limit !== undefined ? { limit } : {}),
      });
      if (!result.ok) {
        return res.status(result.status).json({ error: result.error });
      }

      return res.json({
        places: result.places,
        queryRadiusMiles: result.queryRadiusMiles,
      });
    } catch (err) {
      console.error('Overpass proxy error:', err);
      return res.status(502).json({
        error: 'OpenStreetMap query failed. Try again, or use random targets.',
      });
    }
  });

  return app;
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  const boot = bootstrapAppConfig();
  const targetsBoot = bootstrapTargetsStore();
  const PORT = process.env.PORT || 3000;
  const app = createApp({
    targetsStore: targetsBoot.store,
    targetsPath: targetsBoot.path,
    targetsPersistent: targetsBoot.persistent,
  });
  app.listen(PORT, () => {
    console.log(`MQ9 Reaper listening on http://localhost:${PORT}`);
    console.log(
      `Config: ${boot.path}${boot.seeded ? ' (seeded from repo)' : ''}${
        boot.persistent ? ' [persistent]' : ''
      }`
    );
    console.log(
      `Targets: ${targetsBoot.path}${
        targetsBoot.persistent ? ' [persistent]' : ''
      }`
    );
    if (!process.env.GOOGLE_MAPS_API_KEY) {
      console.warn(
        'Warning: GOOGLE_MAPS_API_KEY is not set — map will show an error state.'
      );
    }
    if (!process.env.GEOCODING_API_KEY) {
      console.warn(
        'Warning: GEOCODING_API_KEY is not set — address geocoding will return 503.'
      );
    }
    if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
      console.warn(
        'Warning: ADMIN_USERNAME / ADMIN_PASSWORD not set — Admin tab stays hidden.'
      );
    } else if (
      (process.env.ADMIN_PASSWORD || '').length < ADMIN_PASSWORD_MIN_LENGTH
    ) {
      console.warn(
        `Warning: ADMIN_PASSWORD must be at least ${ADMIN_PASSWORD_MIN_LENGTH} characters — Admin stays disabled.`
      );
    } else if (!process.env.ADMIN_SESSION_SECRET) {
      console.warn(
        'Warning: ADMIN_SESSION_SECRET not set — using a password-derived signing key. Set ADMIN_SESSION_SECRET in production.'
      );
    }
    // Same checks as createApp → resolveMcpAuth (incl. https/localhost public URL).
    // Suppress warn here — createApp already emitted any MCP auth warnings.
    const mcpBootAuth = resolveMcpAuth({
      apiKey: process.env.MCP_API_KEY || '',
      oauthClientId: process.env.MCP_OAUTH_CLIENT_ID || '',
      oauthClientSecret: process.env.MCP_OAUTH_CLIENT_SECRET || '',
      publicUrl: resolveMcpPublicUrl(),
      warn: () => {},
    });
    if (!mcpBootAuth.configured) {
      if (!process.env.MCP_API_KEY) {
        console.warn(
          'Warning: MCP_API_KEY not set — remote MCP at /mcp stays disabled (503).'
        );
      } else {
        console.warn(
          `Warning: MCP_API_KEY must be at least ${MCP_API_KEY_MIN_LENGTH} characters — MCP stays disabled.`
        );
      }
    } else {
      console.log('MCP: /mcp enabled (Bearer MCP_API_KEY)');
      if (mcpBootAuth.oauthConfigured) {
        console.log(
          `MCP OAuth: enabled for Claude (issuer ${mcpBootAuth.publicUrl})`
        );
      } else if (mcpBootAuth.oauthReason) {
        console.warn(
          `Warning: ${mcpBootAuth.oauthReason} — Claude OAuth connector stays disabled (Cursor Bearer still works).`
        );
      }
    }
  });
}
