/**
 * @param {'select' | 'review'} panel
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
 * @param {'select' | 'review'} panel
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
