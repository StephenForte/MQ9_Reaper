import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { describe, it } from 'node:test';
import {
  ADMIN_COOKIE,
  createSessionToken,
  parseCookies,
  requestIsSecure,
  sessionClearCookieHeader,
  sessionSetCookieHeader,
  verifySessionToken,
} from '../lib/admin-session.js';

/**
 * @param {string} username
 * @param {string} password
 * @param {number} exp
 */
function signedToken(username, password, exp) {
  const payload = Buffer.from(
    JSON.stringify({ u: username, exp }),
    'utf8'
  ).toString('base64url');
  const key = crypto.createHash('sha256').update(`mq9-admin:${password}`).digest();
  const sig = crypto.createHmac('sha256', key).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

describe('verifySessionToken edge cases', () => {
  it('rejects missing, malformed, and tampered tokens', () => {
    assert.equal(verifySessionToken(undefined, 'a', 'b'), false);
    assert.equal(verifySessionToken('', 'a', 'b'), false);
    assert.equal(verifySessionToken('no-dot', 'a', 'b'), false);
    assert.equal(verifySessionToken('a.b.c', 'a', 'b'), false);

    const token = createSessionToken('ops', 'secret');
    const [payload] = token.split('.');
    assert.equal(
      verifySessionToken(`${payload}.deadbeefdeadbeefdeadbeefdeadbeef`, 'ops', 'secret'),
      false
    );
  });

  it('rejects expired tokens', () => {
    const token = signedToken('ops', 'secret', Date.now() - 60_000);
    assert.equal(verifySessionToken(token, 'ops', 'secret'), false);
  });

  it('rejects payload that is not valid JSON object shape', () => {
    const payload = Buffer.from('not-json', 'utf8').toString('base64url');
    const key = crypto.createHash('sha256').update('mq9-admin:secret').digest();
    const sig = crypto.createHmac('sha256', key).update(payload).digest('base64url');
    assert.equal(verifySessionToken(`${payload}.${sig}`, 'ops', 'secret'), false);
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
