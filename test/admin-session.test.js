import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { describe, it } from 'node:test';
import {
  ADMIN_COOKIE,
  ADMIN_PASSWORD_MIN_LENGTH,
  ADMIN_SESSION_SECRET_MIN_LENGTH,
  credentialsMatch,
  createSessionToken,
  parseCookies,
  requestIsSecure,
  resolveAdminAuth,
  sessionClearCookieHeader,
  sessionSetCookieHeader,
  timingSafeEqualString,
  verifySessionToken,
} from '../lib/admin-session.js';

const SECRET = 'unit-test-session-secret';

/**
 * @param {string} username
 * @param {string} sessionSecret
 * @param {number} exp
 */
function signedToken(username, sessionSecret, exp) {
  const payload = Buffer.from(
    JSON.stringify({ u: username, exp }),
    'utf8'
  ).toString('base64url');
  const key = crypto
    .createHash('sha256')
    .update(`mq9-admin:${sessionSecret}`)
    .digest();
  const sig = crypto.createHmac('sha256', key).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

describe('timingSafeEqualString / credentialsMatch', () => {
  it('matches equal credentials and rejects mismatches', () => {
    assert.equal(timingSafeEqualString('abc', 'abc'), true);
    assert.equal(timingSafeEqualString('abc', 'abd'), false);
    assert.equal(credentialsMatch('u', 'p', 'u', 'p'), true);
    assert.equal(credentialsMatch('u', 'p', 'u', 'x'), false);
    assert.equal(credentialsMatch('u', 'p', 'x', 'p'), false);
  });
});

describe('resolveAdminAuth', () => {
  it('disables Admin when password is too short', () => {
    const warnings = [];
    const auth = resolveAdminAuth({
      username: 'admin',
      password: 'short',
      sessionSecret: 'long-enough-session!',
      warn: (m) => warnings.push(m),
    });
    assert.equal(auth.configured, false);
    assert.match(auth.reason || '', /shorter than/);
    assert.ok(warnings.some((m) => m.includes(String(ADMIN_PASSWORD_MIN_LENGTH))));
  });

  it('disables Admin when session secret is too short', () => {
    const auth = resolveAdminAuth({
      username: 'admin',
      password: 'a'.repeat(ADMIN_PASSWORD_MIN_LENGTH),
      sessionSecret: 'short',
      warn: () => {},
    });
    assert.equal(auth.configured, false);
    assert.match(auth.reason || '', /SESSION_SECRET/);
    assert.ok(ADMIN_SESSION_SECRET_MIN_LENGTH >= 16);
  });

  it('enables Admin and derives secret when ADMIN_SESSION_SECRET is omitted', () => {
    const warnings = [];
    const auth = resolveAdminAuth({
      username: 'admin',
      password: 'a'.repeat(ADMIN_PASSWORD_MIN_LENGTH),
      sessionSecret: '',
      warn: (m) => warnings.push(m),
    });
    assert.equal(auth.configured, true);
    assert.ok(auth.sessionSecret.length > 16);
    assert.ok(warnings.some((m) => /ADMIN_SESSION_SECRET is not set/.test(m)));
  });

  it('uses provided session secret when valid', () => {
    const secret = 'b'.repeat(ADMIN_SESSION_SECRET_MIN_LENGTH);
    const auth = resolveAdminAuth({
      username: 'admin',
      password: 'a'.repeat(ADMIN_PASSWORD_MIN_LENGTH),
      sessionSecret: secret,
      warn: () => {
        throw new Error('should not warn');
      },
    });
    assert.equal(auth.configured, true);
    assert.equal(auth.sessionSecret, secret);
  });
});

describe('verifySessionToken edge cases', () => {
  it('rejects missing, malformed, and tampered tokens', () => {
    assert.equal(verifySessionToken(undefined, 'a', SECRET), false);
    assert.equal(verifySessionToken('', 'a', SECRET), false);
    assert.equal(verifySessionToken('no-dot', 'a', SECRET), false);
    assert.equal(verifySessionToken('a.b.c', 'a', SECRET), false);

    const token = createSessionToken('ops', SECRET);
    const [payload] = token.split('.');
    assert.equal(
      verifySessionToken(`${payload}.deadbeefdeadbeefdeadbeefdeadbeef`, 'ops', SECRET),
      false
    );
  });

  it('rejects expired tokens', () => {
    const token = signedToken('ops', SECRET, Date.now() - 60_000);
    assert.equal(verifySessionToken(token, 'ops', SECRET), false);
  });

  it('rejects payload that is not valid JSON object shape', () => {
    const payload = Buffer.from('not-json', 'utf8').toString('base64url');
    const key = crypto.createHash('sha256').update(`mq9-admin:${SECRET}`).digest();
    const sig = crypto.createHmac('sha256', key).update(payload).digest('base64url');
    assert.equal(verifySessionToken(`${payload}.${sig}`, 'ops', SECRET), false);
  });

  it('round-trips a valid session', () => {
    const token = createSessionToken('ops', SECRET);
    assert.equal(verifySessionToken(token, 'ops', SECRET), true);
    assert.equal(verifySessionToken(token, 'ops', 'wrong-secret!!!!!!!!'), false);
    assert.equal(verifySessionToken(token, 'other', SECRET), false);
  });
});

describe('parseCookies', () => {
  it('returns empty object when Cookie header is missing', () => {
    assert.deepEqual(parseCookies({ headers: {} }), {});
  });

  it('parses multiple cookies and decodes values', () => {
    const cookies = parseCookies({
      headers: {
        cookie: `${ADMIN_COOKIE}=abc%2Fdef; other=1`,
      },
    });
    assert.equal(cookies[ADMIN_COOKIE], 'abc/def');
    assert.equal(cookies.other, '1');
  });

  it('skips segments without "="', () => {
    const cookies = parseCookies({
      headers: { cookie: 'alone; ok=yes' },
    });
    assert.equal(cookies.ok, 'yes');
    assert.equal(cookies.alone, undefined);
  });
});

describe('session cookie headers', () => {
  it('sets HttpOnly SameSite cookie with optional Secure', () => {
    const insecure = sessionSetCookieHeader({}, false, 'tok+1');
    assert.match(insecure, new RegExp(`^${ADMIN_COOKIE}=`));
    assert.match(insecure, /HttpOnly/);
    assert.match(insecure, /SameSite=Lax/);
    assert.match(insecure, /Path=\//);
    assert.doesNotMatch(insecure, /Secure/);
    assert.match(insecure, /tok%2B1/);

    const secure = sessionSetCookieHeader({}, true, 'tok');
    assert.match(secure, /Secure/);
  });

  it('clears cookie with Max-Age=0', () => {
    const clear = sessionClearCookieHeader(true);
    assert.match(clear, new RegExp(`${ADMIN_COOKIE}=`));
    assert.match(clear, /Max-Age=0/);
    assert.match(clear, /Secure/);
  });
});

describe('requestIsSecure', () => {
  it('detects req.secure and x-forwarded-proto', () => {
    assert.equal(requestIsSecure({ secure: true, headers: {} }), true);
    assert.equal(
      requestIsSecure({
        secure: false,
        headers: { 'x-forwarded-proto': 'https' },
      }),
      true
    );
    assert.equal(
      requestIsSecure({
        secure: false,
        headers: { 'x-forwarded-proto': 'https, http' },
      }),
      true
    );
    assert.equal(
      requestIsSecure({
        secure: false,
        headers: { 'x-forwarded-proto': 'http' },
      }),
      false
    );
    assert.equal(requestIsSecure({ secure: false, headers: {} }), false);
  });
});
