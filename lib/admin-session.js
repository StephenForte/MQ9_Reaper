import crypto from 'node:crypto';

export const ADMIN_COOKIE = 'mq9_admin';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

/**
 * @param {string} password
 */
function signingKey(password) {
  return crypto.createHash('sha256').update(`mq9-admin:${password}`).digest();
}

/**
 * @param {string} username
 * @param {string} password
 * @returns {string}
 */
export function createSessionToken(username, password) {
  const payload = Buffer.from(
    JSON.stringify({
      u: username,
      exp: Date.now() + SESSION_TTL_MS,
    }),
    'utf8'
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', signingKey(password))
    .update(payload)
    .digest('base64url');
  return `${payload}.${sig}`;
}

/**
 * @param {string | undefined} token
 * @param {string} username
 * @param {string} password
 * @returns {boolean}
 */
export function verifySessionToken(token, username, password) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  const expected = crypto
    .createHmac('sha256', signingKey(password))
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
    if (data.u !== username) return false;
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
