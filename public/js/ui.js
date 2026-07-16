/**
 * Field / map / status helpers (XSS-safe: textContent only).
 */

/**
 * @param {'select' | 'review' | 'bda'} panel
 * @param {string} title
 * @param {string} message
 */
export function showMapError(panel, title, message) {
  const el = document.getElementById(`map-${panel}-error`);
  if (!el) return;
  el.hidden = false;
  el.replaceChildren();

  const strong = document.createElement('strong');
  strong.textContent = title;
  const p = document.createElement('p');
  p.textContent = message;
  el.append(strong, p);
}

/**
 * @param {'select' | 'review' | 'bda'} panel
 */
export function hideMapError(panel) {
  const el = document.getElementById(`map-${panel}-error`);
  if (!el) return;
  el.hidden = true;
  el.replaceChildren();
}

/**
 * @param {string} id
 * @param {string} message empty string clears
 */
export function setFieldError(id, message) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!message) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.textContent = message;
}

/**
 * Non-blocking status / notice (not an error).
 * @param {string} id
 * @param {string} message empty string clears
 */
export function setStatusMessage(id, message) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!message) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.textContent = message;
}
