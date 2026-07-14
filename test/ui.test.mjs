import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  hideMapError,
  setFieldError,
  setStatusMessage,
  showMapError,
} from '../public/js/ui.js';
import { fakeElement, installFakeDocument } from './helpers/fake-dom.mjs';

describe('setFieldError / setStatusMessage', () => {
  it('sets and clears textContent without using innerHTML', () => {
    const err = fakeElement({ id: 'address-error' });
    const status = fakeElement({ id: 'review-status' });
    const restore = installFakeDocument({
      'address-error': err,
      'review-status': status,
    });

    setFieldError('address-error', "Couldn't find that address");
    assert.equal(err.hidden, false);
    assert.equal(err.textContent, "Couldn't find that address");

    setFieldError('address-error', '');
    assert.equal(err.hidden, true);
    assert.equal(err.textContent, '');

    setStatusMessage('review-status', 'Loaded 12 targets.');
    assert.equal(status.hidden, false);
    assert.equal(status.textContent, 'Loaded 12 targets.');

    setStatusMessage('review-status', '');
    assert.equal(status.hidden, true);

    setFieldError('missing', 'no-op');
    setStatusMessage('missing', 'no-op');

    restore();
  });
});

describe('showMapError / hideMapError', () => {
  it('builds title + message with textContent nodes', () => {
    const panel = fakeElement({ id: 'map-select-error' });
    const restore = installFakeDocument({
      'map-select-error': panel,
    });

    showMapError('select', 'Maps key missing', 'Set GOOGLE_MAPS_API_KEY.');
    assert.equal(panel.hidden, false);
    assert.equal(panel.children.length, 2);
    assert.equal(panel.children[0].textContent, 'Maps key missing');
    assert.equal(panel.children[1].textContent, 'Set GOOGLE_MAPS_API_KEY.');
    assert.equal(panel.children[0].tagName, 'STRONG');
    assert.equal(panel.children[1].tagName, 'P');

    hideMapError('select');
    assert.equal(panel.hidden, true);
    assert.equal(panel.children.length, 0);

    showMapError('review', 'x', 'y'); // missing element — no throw
    hideMapError('review');

    restore();
  });
});
