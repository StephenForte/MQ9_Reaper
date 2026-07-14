/**
 * Lightweight DOM lookups used across selection / targeting controllers.
 * @param {string} id
 * @returns {HTMLElement | null}
 */
export function byId(id) {
  return document.getElementById(id);
}

/**
 * @template {HTMLElement} T
 * @param {string} id
 * @returns {T | null}
 */
export function byIdAs(id) {
  return /** @type {T | null} */ (document.getElementById(id));
}
