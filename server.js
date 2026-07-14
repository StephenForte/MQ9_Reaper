import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express from 'express';
import {
  CONFIG_MD,
  defaultsForClient,
  getAppConfig,
  mergeAdminConfigPatch,
  setAppConfig,
  writeAppConfig,
} from './config.js';
import {
  ADMIN_COOKIE,
  createSessionToken,
  parseCookies,
  requestIsSecure,
  sessionClearCookieHeader,
  sessionSetCookieHeader,
  verifySessionToken,
} from './lib/admin-session.js';
import { geocodeAddress, reverseGeocode } from './lib/geocode.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * @param {{
 *   mapsKey?: string,
 *   geocodingKey?: string,
 *   config?: ReturnType<typeof getAppConfig>,
 *   configPath?: string,
 *   writeConfigFn?: (config: ReturnType<typeof getAppConfig>) => void,
 *   adminUsername?: string,
 *   adminPassword?: string,
 *   geocodeFn?: typeof geocodeAddress,
 *   reverseGeocodeFn?: typeof reverseGeocode,
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
  const configPath = deps.configPath || CONFIG_MD;
  const writeConfig =
    deps.writeConfigFn ||
    ((next) => {
      writeAppConfig(next, { path: configPath });
    });
  const geocodeFn = deps.geocodeFn || geocodeAddress;
  const reverseGeocodeFn = deps.reverseGeocodeFn || reverseGeocode;

  const adminUsername =
    deps.adminUsername !== undefined
      ? deps.adminUsername
      : process.env.ADMIN_USERNAME || '';
  const adminPassword =
    deps.adminPassword !== undefined
      ? deps.adminPassword
      : process.env.ADMIN_PASSWORD || '';
  const adminConfigured = Boolean(adminUsername && adminPassword);

  const app = express();
  app.use(express.json({ limit: '32kb' }));
  app.use(express.static(path.join(__dirname, 'public')));

  /**
   * @param {import('express').Request} req
   */
  function isAdminAuthenticated(req) {
    if (!adminConfigured) return false;
    const cookies = parseCookies(req);
    return verifySessionToken(
      cookies[ADMIN_COOKIE],
      adminUsername,
      adminPassword
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
        error: 'Admin is not configured. Set ADMIN_USERNAME and ADMIN_PASSWORD.',
      });
    }
    if (!isAdminAuthenticated(req)) {
      return res.status(401).json({ error: 'Admin login required.' });
    }
    return next();
  }

  /** Liveness for Render / local smoke checks. Use ?probe=geocode for key smoke. */
  app.get('/api/health', async (req, res) => {
    const payload = {
      ok: true,
      mapsKeyConfigured: Boolean(mapsKey),
      geocodingConfigured: Boolean(geocodingKey),
      adminConfigured,
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

  app.post('/api/admin/login', (req, res) => {
    if (!adminConfigured) {
      return res.status(503).json({
        error: 'Admin is not configured. Set ADMIN_USERNAME and ADMIN_PASSWORD.',
      });
    }

    const username =
      typeof req.body?.username === 'string' ? req.body.username : '';
    const password =
      typeof req.body?.password === 'string' ? req.body.password : '';

    if (username !== adminUsername || password !== adminPassword) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const token = createSessionToken(adminUsername, adminPassword);
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
      persistenceNote:
        'Saved to config/app-config.md on this server. On Render without a persistent disk, edits may be lost on redeploy (see PRD P7).',
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

  return app;
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  const PORT = process.env.PORT || 3000;
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`MQ9 Reaper listening on http://localhost:${PORT}`);
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
    }
  });
}
