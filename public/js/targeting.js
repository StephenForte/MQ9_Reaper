import { byId, byIdAs } from './dom.js';
import { PRIORITIES } from './schema.js';
import {
  collectValidatedTargeting,
  isTargetingSelectionStale,
  targetingExportGate,
} from './targeting-logic.js';
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
  /** @type {number | null} */
  let activeIndex = null;
  /** @type {((candidateId: string | null) => void) | null} */
  let onActiveCandidateChange = null;

  function els() {
    return {
      section: byId('section-targeting'),
      list: byId('targeting-list'),
      staleEl: byId('targeting-stale'),
      downloadBtn: byIdAs('btn-download-json'),
      saveServerBtn: byIdAs('btn-save-server'),
      titleInput: byIdAs('input-target-title'),
      categoryInput: byIdAs('input-target-category'),
      successEl: byId('targeting-success'),
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
   * @param {number | null} index
   * @param {{ pan?: boolean }} [opts]
   */
  function setActiveIndex(index, opts = {}) {
    const next =
      index != null && Number.isInteger(index) && index >= 0 && index < rows.length
        ? index
        : null;
    const changed = next !== activeIndex;
    activeIndex = next;

    const { list } = els();
    if (list) {
      list.querySelectorAll('.targeting-row').forEach((article) => {
        if (!(article instanceof HTMLElement)) return;
        const i = Number(article.dataset.index);
        article.classList.toggle('is-active', next != null && i === next);
      });
    }

    if (!changed && !opts.pan) return;

    const candidateId =
      next != null ? rows[next]?.candidateId || null : null;
    onActiveCandidateChange?.(candidateId);
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
    if (row.candidateId) article.dataset.candidateId = row.candidateId;
    if (activeIndex === index) article.classList.add('is-active');

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

    article.addEventListener('focusin', () => {
      setActiveIndex(index, { pan: true });
    });
    article.addEventListener('pointerdown', () => {
      setActiveIndex(index, { pan: true });
    });

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
    const { downloadBtn, saveServerBtn } = els();
    const buttons = [downloadBtn, saveServerBtn].filter(Boolean);
    if (buttons.length === 0) return;

    if (visible && !stale && rows.length > 0) syncAllFromDom();
    const meta = readFileMeta();
    const gate = targetingExportGate({
      visible,
      stale,
      rows,
      title: meta.title,
      category: meta.category,
    });
    for (const btn of buttons) {
      btn.disabled = !gate.ready;
      btn.title = gate.title;
    }
  }

  /**
   * @returns {{ title: string, category: string }}
   */
  function readFileMeta() {
    const { titleInput, categoryInput } = els();
    return {
      title: titleInput?.value || '',
      category: categoryInput?.value || '',
    };
  }

  /**
   * @param {{ title?: string, category?: string }} [meta]
   */
  function setFileMeta(meta = {}) {
    const { titleInput, categoryInput } = els();
    if (titleInput && meta.title !== undefined) titleInput.value = meta.title;
    if (categoryInput && meta.category !== undefined) {
      categoryInput.value = meta.category;
    }
  }

  function wireMetaFields() {
    const { titleInput, categoryInput } = els();
    const onMetaChange = () => {
      setFieldError('targeting-error', '');
      clearSuccess();
      updateDownloadEnabled();
    };
    titleInput?.addEventListener('input', onMetaChange);
    categoryInput?.addEventListener('input', onMetaChange);
  }

  function render() {
    const { section, list, downloadBtn, saveServerBtn } = els();
    if (!section || !list) return;

    list.replaceChildren();
    rows.forEach((row, index) => {
      list.append(buildRow(row, index));
    });

    section.hidden = !visible;
    if (downloadBtn) downloadBtn.disabled = true;
    if (saveServerBtn) saveServerBtn.disabled = true;
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
    setActiveIndex(null);
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
    setActiveIndex(null);
    setStaleMessage('');
    setFieldError('targeting-error', '');
    clearSuccess();
    setFileMeta({ title: '', category: '' });
    const { section, list, downloadBtn, saveServerBtn } = els();
    if (list) list.replaceChildren();
    if (section) section.hidden = true;
    if (downloadBtn) downloadBtn.disabled = true;
    if (saveServerBtn) saveServerBtn.disabled = true;
  }

  /**
   * @param {(candidateId: string | null) => void} handler
   */
  function setOnActiveCandidateChange(handler) {
    onActiveCandidateChange = handler;
  }

  /**
   * Mark draft stale when live selection no longer matches the snapshot.
   * @param {Array<{ id: string, selected: boolean }>} candidates
   */
  function syncWithSelection(candidates) {
    if (!visible) return;

    if (!isTargetingSelectionStale(candidates, snapshotCandidateIds)) {
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
   *   title: string,
   *   category: string,
   * } | {
   *   ok: false,
   *   message: string,
   *   rowIndex?: number,
   *   field?: string,
   * }}
   */
  function collectValidated(limits) {
    syncAllFromDom();
    const { list } = els();
    list?.querySelectorAll('.targeting-row').forEach((article) => {
      if (article instanceof HTMLElement) clearRowError(article);
    });

    const meta = readFileMeta();
    const result = collectValidatedTargeting({
      visible,
      stale,
      rows,
      title: meta.title,
      category: meta.category,
      minSelections: limits.minSelections,
      maxSelections: limits.maxSelections,
    });

    if (!result.ok && result.rowIndex != null && result.rowMessage) {
      const article = list?.querySelector(
        `.targeting-row[data-index="${result.rowIndex}"]`
      );
      if (article instanceof HTMLElement) {
        showRowError(article, result.rowMessage, result.field);
      }
    }

    return result;
  }

  wireMetaFields();

  return {
    openWithRows,
    clear,
    syncWithSelection,
    collectValidated,
    setSuccess,
    clearSuccess,
    readFileMeta,
    setFileMeta,
    setOnActiveCandidateChange,
    isVisible: () => visible,
    isStale: () => stale,
    getRows: () => rows.map((row) => ({ ...row })),
    getSnapshotCandidateIds: () => snapshotCandidateIds.slice(),
    getActiveCandidateId: () =>
      activeIndex != null ? rows[activeIndex]?.candidateId || null : null,
  };
}
