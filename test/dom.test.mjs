import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { byId, byIdAs } from '../public/js/dom.js';
import { fakeElement, installFakeDocument } from './helpers/fake-dom.mjs';

describe('byId / byIdAs', () => {
  it('looks up elements by id and returns null when missing', () => {
    const el = fakeElement({ id: 'input-address' });
    const restore = installFakeDocument({ 'input-address': el });

    assert.equal(byId('input-address'), el);
    assert.equal(byIdAs('input-address'), el);
    assert.equal(byId('missing'), null);

    restore();
  });
});
