import { PRIORITIES, validateTargetingRow } from './schema.js';
import { setFieldError } from './ui.js';

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   lat: number,
 *   lng: number,
 *   confidence: number | null,
 *   priority: string,
 *   candidateId?: string,
 * }} TargetingRow
 */

/**
 * Targeting-list UI (P3): build rows, collect edits, surface field errors.
 */
export function createTargetingController() {
  /** @type {TargetingRow[]} */
  let rows = [];
  /** @type {string[]} */
  let snapshotCandidateIds = [];
  let visible = false;
  let stale = false;

  function els() {
    return {
      section: document.getElementById('section-targeting'),
      list: document.getElementById('targeting-list'),
      staleEl: document.getElementById('targeting-stale'),
      downloadBtn: /** @type {HTMLButtonElement | null} */ (
        document.getElementById('btn-download-json')
      ),
      successEl: document.getElementById('targeting-success'),
    };
  }

  function clearSuccess() {
    const { successEl } = els();
    if (!successEl) return;
    successEl.hidden = true;
    successEl.textContent = '';
  }

  /**
   * @param {string} message
   */
  function setSuccess(message) {
    const { successEl } = els();
    if (!successEl) return;
    successEl.hidden = !message;
    successEl.textContent = message;
  }

  function setStaleMessage(message) {
    const { staleEl } = els();
    if (!staleEl) return;
    if (!message) {
      staleEl.hidden = true;
      staleEl.textContent = '';
      return;
    }
    staleEl.hidden = false;
    staleEl.textContent = message;
  }

  /**
   * @param {TargetingRow} row
   * @param {number} index
   * @returns {HTMLElement}
   */
  function buildRow(row, index) {
    const article = document.createElement('article');
    article.className = 'targeting-row';
    article.dataset.index = String(index);

    const heading = document.createElement('header');
    heading.className = 'targeting-row-header';

    const idEl = document.createElement('span');
    idEl.className = 'targeting-row-id';
    idEl.textContent = row.id;

    const coords = document.createElement('span');
    coords.className = 'targeting-row-coords';
    coords.textContent = `${row.lat.toFixed(5)}, ${row.lng.toFixed(5)}`;

    heading.append(idEl, coords);

    const nameField = document.createElement('label');
    nameField.className = 'field';
    const nameLabel = document.createElement('span');
    nameLabel.className = 'field-label';
    nameLabel.textContent = 'Name';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.name = `target-name-${index}`;
    nameInput.autocomplete = 'off';
    nameInput.value = row.name;
    nameInput.dataset.field = 'name';
    nameField.append(nameLabel, nameInput);

    const metaRow = document.createElement('div');
    metaRow.className = 'field-row';

    const confField = document.createElement('label');
    confField.className = 'field';
    const confLabel = document.createElement('span');
    confLabel.className = 'field-label';
    confLabel.textContent = 'Confidence';
    const confSelect = document.createElement('select');
    confSelect.name = `target-confidence-${index}`;
    confSelect.dataset.field = 'confidence';
    const confPlaceholder = document.createElement('option');
    confPlaceholder.value = '';
    confPlaceholder.textContent = '—';
    confSelect.append(confPlaceholder);
    for (let n = 1; n <= 5; n += 1) {
      const opt = document.createElement('option');
      opt.value = String(n);
      opt.textContent = String(n);
      if (row.confidence === n) opt.selected = true;
      confSelect.append(opt);
    }
    confField.append(confLabel, confSelect);

    const priField = document.createElement('label');
    priField.className = 'field';
    const priLabel = document.createElement('span');
    priLabel.className = 'field-label';
    priLabel.textContent = 'Priority';
    const priSelect = document.createElement('select');
    priSelect.name = `target-priority-${index}`;
    priSelect.dataset.field = 'priority';
    const priPlaceholder = document.createElement('option');
    priPlaceholder.value = '';
    priPlaceholder.textContent = '—';
    priSelect.append(priPlaceholder);
    for (const priority of PRIORITIES) {
      const opt = document.createElement('option');
      opt.value = priority;
      opt.textContent = priority;
      if (row.priority === priority) opt.selected = true;
      priSelect.append(opt);
    }
    priField.append(priLabel, priSelect);

    metaRow.append(confField, priField);

    const rowError = document.createElement('p');
    rowError.className = 'field-error targeting-row-error';
    rowError.hidden = true;
    rowError.dataset.role = 'row-error';

    const onChange = () => {
      syncRowFromDom(index, article);
      clearRowError(article);
      setFieldError('targeting-error', '');
      clearSuccess();
      updateDownloadEnabled();
    };

    nameInput.addEventListener('input', onChange);
    confSelect.addEventListener('change', onChange);
    priSelect.addEventListener('change', onChange);

    article.append(heading, nameField, metaRow, rowError);
    return article;
  }

  /**
   * @param {HTMLElement} article
   */
  function clearRowError(article) {
    const err = article.querySelector('[data-role="row-error"]');
    if (!(err instanceof HTMLElement)) return;
    err.hidden = true;
    err.textContent = '';
    article.classList.remove('has-error');
  }

  /**
   * @param {HTMLElement} article
   * @param {string} message
   * @param {string} [field]
   */
  function showRowError(article, message, field) {
    const err = article.querySelector('[data-role="row-error"]');
    if (err instanceof HTMLElement) {
      err.hidden = false;
      err.textContent = message;
    }
    article.classList.add('has-error');
    if (field) {
      const control = article.querySelector(`[data-field="${field}"]`);
      if (control instanceof HTMLElement) control.focus();
    }
  }

  /**
   * @param {number} index
   * @param {HTMLElement} article
   */
  function syncRowFromDom(index, article) {
    const row = rows[index];
    if (!row) return;

    const nameInput = article.querySelector('[data-field="name"]');
    const confSelect = article.querySelector('[data-field="confidence"]');
    const priSelect = article.querySelector('[data-field="priority"]');

    row.name =
      nameInput instanceof HTMLInputElement ? nameInput.value : row.name;

    if (confSelect instanceof HTMLSelectElement) {
      const raw = confSelect.value;
      row.confidence = raw === '' ? null : Number(raw);
    }

    if (priSelect instanceof HTMLSelectElement) {
      row.priority = priSelect.value;
    }
  }

  function syncAllFromDom() {
    const { list } = els();
    if (!list) return;
    list.querySelectorAll('.targeting-row').forEach((article) => {
      if (!(article instanceof HTMLElement)) return;
      const index = Number(article.dataset.index);
      if (!Number.isInteger(index)) return;
      syncRowFromDom(index, article);
    });
  }

  function updateDownloadEnabled() {
    const { downloadBtn } = els();
    if (!downloadBtn) return;
    if (!visible || stale || rows.length === 0) {
      downloadBtn.disabled = true;
      return;
    }
    syncAllFromDom();
    downloadBtn.disabled = !rows.every((row) => validateTargetingRow(row).ok);
  }

  function render() {
    const { section, list, downloadBtn } = els();
    if (!section || !list) return;

    list.replaceChildren();
    rows.forEach((row, index) => {
      list.append(buildRow(row, index));
    });

    section.hidden = !visible;
    if (downloadBtn) downloadBtn.disabled = true;
    setFieldError('targeting-error', '');
    clearSuccess();
    updateDownloadEnabled();
  }

  /**
   * @param {TargetingRow[]} nextRows
   */
  function openWithRows(nextRows) {
    rows = nextRows.map((row) => ({ ...row }));
    snapshotCandidateIds = nextRows
      .map((row) => row.candidateId)
      .filter(Boolean);
    visible = true;
    stale = false;
    setStaleMessage('');
    render();

    const { section } = els();
    section?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function clear() {
    rows = [];
    snapshotCandidateIds = [];
    visible = false;
    stale = false;
    setStaleMessage('');
    setFieldError('targeting-error', '');
    clearSuccess();
    const { section, list, downloadBtn } = els();
    if (list) list.replaceChildren();
    if (section) section.hidden = true;
    if (downloadBtn) downloadBtn.disabled = true;
  }

  /**
   * Mark draft stale when live selection no longer matches the snapshot.
   * @param {Array<{ id: string, selected: boolean }>} candidates
   */
  function syncWithSelection(candidates) {
    if (!visible) return;

    const liveIds = candidates
      .filter((dot) => dot.selected)
      .map((dot) => dot.id);
    const sameIds =
      liveIds.length === snapshotCandidateIds.length &&
      liveIds.every((id, i) => id === snapshotCandidateIds[i]);

    if (sameIds) {
      if (stale) {
        stale = false;
        setStaleMessage('');
        updateDownloadEnabled();
      }
      return;
    }

    stale = true;
    setStaleMessage(
      'Selection changed. Click Save Targets again to rebuild this list (edits will be lost).'
    );
    clearSuccess();
    setFieldError('targeting-error', '');
    updateDownloadEnabled();
  }

  /**
   * @param {{ minSelections: number, maxSelections: number }} limits
   * @returns {{
   *   ok: true,
   *   rows: TargetingRow[],
   * } | {
   *   ok: false,
   *   message: string,
   *   rowIndex?: number,
   *   field?: string,
   * }}
   */
  function collectValidated(limits) {
    if (!visible) {
      return { ok: false, message: 'Save Targets first to build the list.' };
    }
    if (stale) {
      return {
        ok: false,
        message:
          'Selection changed. Click Save Targets again before downloading.',
      };
    }

    syncAllFromDom();
    const { list } = els();
    list?.querySelectorAll('.targeting-row').forEach((article) => {
      if (article instanceof HTMLElement) clearRowError(article);
    });

    if (
      rows.length < limits.minSelections ||
      rows.length > limits.maxSelections
    ) {
      return {
        ok: false,
        message: `Select between ${limits.minSelections} and ${limits.maxSelections} targets (found ${rows.length}).`,
      };
    }

    for (let i = 0; i < rows.length; i += 1) {
      const result = validateTargetingRow(rows[i]);
      if (!result.ok) {
        const article = list?.querySelector(
          `.targeting-row[data-index="${i}"]`
        );
        if (article instanceof HTMLElement) {
          showRowError(article, result.message, result.field);
        }
        return {
          ok: false,
          message: `Target ${rows[i].id}: ${result.message}`,
          rowIndex: i,
          field: result.field,
        };
      }
    }

    return {
      ok: true,
      rows: rows.map((row) => ({
        ...row,
        name: row.name.trim(),
      })),
    };
  }

  return {
    openWithRows,
    clear,
    syncWithSelection,
    collectValidated,
    setSuccess,
    clearSuccess,
    isVisible: () => visible,
    isStale: () => stale,
    getRows: () => rows.map((row) => ({ ...row })),
    getSnapshotCandidateIds: () => snapshotCandidateIds.slice(),
  };
}
