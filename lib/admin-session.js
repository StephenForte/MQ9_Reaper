import crypto from 'node:crypto';

export const ADMIN_COOKIE = 'mq9_admin';
export const ADMIN_PASSWORD_MIN_LENGTH = 12;
export const ADMIN_SESSION_SECRET_MIN_LENGTH = 16;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

/**
 * @param {string} sessionSecret
 */
function signingKey(sessionSecret) {
  return crypto.createHash('sha256').update(`mq9-admin:${sessionSecret}`).digest();
}

/**
 * Timing-safe string equality (pads via SHA-256 digests so lengths don't leak).
 * @param {string} a
 * @param {string} b
 */
export function timingSafeEqualString(a, b) {
  const digA = crypto.createHash('sha256').update(String(a), 'utf8').digest();
  const digB = crypto.createHash('sha256').update(String(b), 'utf8').digest();
  return crypto.timingSafeEqual(digA, digB);
}

/**
 * @param {string} username
 * @param {string} password
 * @param {string} expectedUsername
 * @param {string} expectedPassword
 */
export function credentialsMatch(
  username,
  password,
  expectedUsername,
  expectedPassword
) {
  const userOk = timingSafeEqualString(username, expectedUsername);
  const passOk = timingSafeEqualString(password, expectedPassword);
  return userOk && passOk;
}

/**
 * Resolve whether Admin is enabled and which secret signs sessions.
 * @param {{
 *   username?: string,
 *   password?: string,
 *   sessionSecret?: string,
 *   warn?: (message: string) => void,
 * }} opts
 * @returns {{
 *   configured: boolean,
 *   username: string,
 *   password: string,
 *   sessionSecret: string,
 *   reason: string | null,
 * }}
 */
export function resolveAdminAuth(opts = {}) {
  const warn = opts.warn || ((message) => console.warn(message));
  const username = typeof opts.username === 'string' ? opts.username : '';
  const password = typeof opts.password === 'string' ? opts.password : '';
  const providedSecret =
    typeof opts.sessionSecret === 'string' ? opts.sessionSecret : '';

  if (!username || !password) {
    return {
      configured: false,
      username: '',
      password: '',
      sessionSecret: '',
      reason: 'ADMIN_USERNAME / ADMIN_PASSWORD not set',
    };
  }

  if (password.length < ADMIN_PASSWORD_MIN_LENGTH) {
    warn(
      `Warning: ADMIN_PASSWORD must be at least ${ADMIN_PASSWORD_MIN_LENGTH} characters — Admin stays disabled.`
    );
    return {
      configured: false,
      username: '',
      password: '',
      sessionSecret: '',
      reason: `ADMIN_PASSWORD shorter than ${ADMIN_PASSWORD_MIN_LENGTH} characters`,
    };
  }

  let sessionSecret = providedSecret;
  if (!sessionSecret) {
    warn(
      'Warning: ADMIN_SESSION_SECRET is not set — deriving session signing key from ADMIN_PASSWORD. Set a dedicated ADMIN_SESSION_SECRET (16+ chars) in production.'
    );
    sessionSecret = crypto
      .createHash('sha256')
      .update(`mq9-admin-fallback:${password}`)
      .digest('hex');
  } else if (sessionSecret.length < ADMIN_SESSION_SECRET_MIN_LENGTH) {
    warn(
      `Warning: ADMIN_SESSION_SECRET must be at least ${ADMIN_SESSION_SECRET_MIN_LENGTH} characters — Admin stays disabled.`
    );
    return {
      configured: false,
      username: '',
      password: '',
      sessionSecret: '',
      reason: `ADMIN_SESSION_SECRET shorter than ${ADMIN_SESSION_SECRET_MIN_LENGTH} characters`,
    };
  }

  return {
    configured: true,
    username,
    password,
    sessionSecret,
    reason: null,
  };
}

/**
 * @param {string} username
 * @param {string} sessionSecret
 * @returns {string}
 */
export function createSessionToken(username, sessionSecret) {
  const payload = Buffer.from(
    JSON.stringify({
      u: username,
      exp: Date.now() + SESSION_TTL_MS,
    }),
    'utf8'
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', signingKey(sessionSecret))
    .update(payload)
    .digest('base64url');
  return `${payload}.${sig}`;
}

/**
 * @param {string | undefined} token
 * @param {string} username
 * @param {string} sessionSecret
 * @returns {boolean}
 */
export function verifySessionToken(token, username, sessionSecret) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  const expected = crypto
    .createHmac('sha256', signingKey(sessionSecret))
    .update(payload)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (
    sigBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(sigBuf, expectedBuf)
  ) {
    return false;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof data.u !== 'string' || typeof data.exp !== 'number') return false;
    if (!timingSafeEqualString(data.u, username)) return false;
    if (data.exp < Date.now()) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {import('express').Request} req
 * @returns {Record<string, string>}
 */
export function parseCookies(req) {
  /** @type {Record<string, string>} */
  const out = {};
  const header = req.headers.cookie;
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

/**
 * @param {import('express').Request} req
 * @param {boolean} secure
 * @param {string} token
 * @returns {string}
 */
export function sessionSetCookieHeader(req, secure, token) {
  const parts = [
    `${ADMIN_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

/**
 * @param {boolean} secure
 * @returns {string}
 */
export function sessionClearCookieHeader(secure) {
  const parts = [
    `${ADMIN_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

/**
 * @param {import('express').Request} req
 */
export function requestIsSecure(req) {
  if (req.secure) return true;
  const proto = req.headers['x-forwarded-proto'];
  if (typeof proto === 'string') {
    return proto.split(',')[0].trim() === 'https';
  }
  return false;
}
