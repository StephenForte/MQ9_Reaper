import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  iconForDot,
  iconForSavedTarget,
  savedTargetIconUrl,
  selectedDotIconUrl,
  unselectedDotIconUrl,
} from '../public/js/dot-markers.js';

describe('dot marker SVG urls', () => {
  it('exports distinct data-URL icons for selected / unselected / saved', () => {
    const unselected = unselectedDotIconUrl();
    const selected = selectedDotIconUrl();
    const saved = savedTargetIconUrl();

    assert.match(unselected, /^data:image\/svg\+xml/);
    assert.match(selected, /^data:image\/svg\+xml/);
    assert.match(saved, /^data:image\/svg\+xml/);
    assert.notEqual(unselected, selected);
    assert.notEqual(selected, saved);

    const decodedSelected = decodeURIComponent(selected.split(',')[1]);
    assert.match(decodedSelected, /#c4a35a/);
    assert.match(decodedSelected, /<circle/);

    const decodedSaved = decodeURIComponent(saved.split(',')[1]);
    assert.match(decodedSaved, /#5b8def/);
    assert.match(decodedSaved, /<polygon/);
  });
});

describe('iconForDot / iconForSavedTarget', () => {
  it('builds Maps Icon shapes when google.maps Size/Point exist', () => {
    globalThis.google = {
      maps: {
        Size: class Size {
          /**
           * @param {number} width
           * @param {number} height
           */
          constructor(width, height) {
            this.width = width;
            this.height = height;
          }
        },
        Point: class Point {
          /**
           * @param {number} x
           * @param {number} y
           */
          constructor(x, y) {
            this.x = x;
            this.y = y;
          }
        },
      },
    };

    const off = iconForDot(false);
    const on = iconForDot(true);
    const saved = iconForSavedTarget();

    assert.equal(off.url, unselectedDotIconUrl());
    assert.equal(on.url, selectedDotIconUrl());
    assert.equal(saved.url, savedTargetIconUrl());
    assert.equal(off.scaledSize.width, 16);
    assert.equal(on.scaledSize.width, 18);
    assert.equal(saved.scaledSize.width, 18);
    assert.equal(off.anchor.x, 8);
    assert.equal(on.anchor.x, 9);

    // @ts-expect-error cleanup
    delete globalThis.google;
  });
});
