import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createLoginRateLimiter } from '../lib/login-rate-limit.js';

describe('createLoginRateLimiter', () => {
  it('allows up to limit attempts then blocks until the window slides', () => {
    let now = 1_000_000;
    const limiter = createLoginRateLimiter({
      limit: 3,
      windowMs: 60_000,
      now: () => now,
    });

    assert.equal(limiter.check('ip').ok, true);
    assert.equal(limiter.check('ip').ok, true);
    assert.equal(limiter.check('ip').ok, true);
    const blocked = limiter.check('ip');
    assert.equal(blocked.ok, false);
    if (!blocked.ok) {
      assert.ok(blocked.retryAfterSec >= 1);
    }

    assert.equal(limiter.check('other-ip').ok, true);

    now += 60_000;
    assert.equal(limiter.check('ip').ok, true);
  });

  it('reset clears hits', () => {
    const limiter = createLoginRateLimiter({ limit: 1, windowMs: 60_000 });
    assert.equal(limiter.check('a').ok, true);
    assert.equal(limiter.check('a').ok, false);
    limiter.reset();
    assert.equal(limiter.check('a').ok, true);
  });
});
