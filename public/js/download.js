/**
 * Client-side JSON download helpers (P3).
 */

/**
 * @param {Date} [date]
 * @returns {string}
 */
export function buildTargetsFilename(date = new Date()) {
  const iso = date.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '');
  return `mq9-targets-${iso}.json`;
}

/**
 * Trigger a browser download of a JSON document.
 * @param {string} filename
 * @param {unknown} data
 */
export function downloadJson(filename, data) {
  const text = `${JSON.stringify(data, null, 2)}\n`;
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
