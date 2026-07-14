/**
 * Minimal document stub for XSS-safe UI helpers (no jsdom dependency).
 */

/**
 * @param {Record<string, HTMLElement>} elementsById
 */
export function installFakeDocument(elementsById) {
  /** @type {typeof globalThis & { document: Document }} */
  const g = globalThis;
  const previous = g.document;

  g.document = /** @type {Document} */ ({
    getElementById(id) {
      return elementsById[id] || null;
    },
    createElement(tag) {
      const children = [];
      const el = {
        tagName: String(tag).toUpperCase(),
        textContent: '',
        hidden: false,
        children,
        append(...nodes) {
          children.push(...nodes);
        },
        replaceChildren(...nodes) {
          children.length = 0;
          children.push(...nodes);
        },
      };
      return el;
    },
  });

  return () => {
    if (previous === undefined) {
      // @ts-expect-error cleanup
      delete g.document;
    } else {
      g.document = previous;
    }
  };
}

/**
 * @param {{ id?: string, hidden?: boolean, textContent?: string }} [opts]
 */
export function fakeElement(opts = {}) {
  const children = [];
  return {
    id: opts.id || '',
    hidden: opts.hidden ?? true,
    textContent: opts.textContent ?? '',
    children,
    append(...nodes) {
      children.push(...nodes);
    },
    replaceChildren(...nodes) {
      children.length = 0;
      children.push(...nodes);
    },
  };
}
