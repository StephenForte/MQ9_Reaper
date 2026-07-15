import { confirmAction } from './confirm.js';
import { byId, byIdAs } from './dom.js';
import { setFieldError, setStatusMessage } from './ui.js';

/**
 * Admin tab: login + edit §6 config + manage saved target JSON files.
 * Save writes the active config file; Apply & reload picks up new defaults.
 */

/**
 * @param {RequestInit} [init]
 */
async function adminFetch(path, init = {}) {
  const headers = new Headers(init.headers || {});
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(path, {
    ...init,
    headers,
    credentials: 'same-origin',
  });
  /** @type {Record<string, unknown>} */
  let body = {};
  try {
    body = await res.json();
  } catch {
    body = {};
  }
  return { res, body };
}

/**
 * @param {Record<string, unknown>} defaults
 */
function fillForm(defaults) {
  const setVal = (id, value) => {
    const el = byIdAs(id);
    if (el) el.value = String(value);
  };
  setVal('admin-radiusMiles', defaults.radiusMiles);
  setVal('admin-dotCount', defaults.dotCount);
  setVal('admin-minSelections', defaults.minSelections);
  setVal('admin-maxSelections', defaults.maxSelections);
  setVal(
    'admin-blockExtraSelections',
    defaults.blockExtraSelections ? 'true' : 'false'
  );
  setVal('admin-minDotSpacingMeters', defaults.minDotSpacingMeters);
  setVal('admin-mapType', defaults.mapType);
  setVal(
    'admin-confirmOnRecenter',
    defaults.confirmOnRecenter ? 'true' : 'false'
  );
  const center =
    defaults.center && typeof defaults.center === 'object'
      ? /** @type {{ lat?: number, lng?: number }} */ (defaults.center)
      : {};
  setVal('admin-defaultCenterLat', center.lat);
  setVal('admin-defaultCenterLng', center.lng);

  const unitEl = byId('admin-radiusUnit');
  if (unitEl) unitEl.textContent = String(defaults.radiusUnit || 'miles');
  const seedEl = byId('admin-seededRng');
  if (seedEl) {
    seedEl.textContent = defaults.seededRng ? 'true' : 'false';
  }
}

function readFormPatch() {
  const num = (id) => {
    const el = byIdAs(id);
    return el ? Number(el.value) : NaN;
  };
  const bool = (id) => byIdAs(id)?.value === 'true';
  const mapType = byIdAs('admin-mapType')?.value || 'hybrid';

  return {
    radiusMiles: num('admin-radiusMiles'),
    dotCount: num('admin-dotCount'),
    minSelections: num('admin-minSelections'),
    maxSelections: num('admin-maxSelections'),
    blockExtraSelections: bool('admin-blockExtraSelections'),
    minDotSpacingMeters: num('admin-minDotSpacingMeters'),
    mapType,
    confirmOnRecenter: bool('admin-confirmOnRecenter'),
    defaultCenterLat: num('admin-defaultCenterLat'),
    defaultCenterLng: num('admin-defaultCenterLng'),
  };
}

/**
 * @param {boolean} authenticated
 */
function setGate(authenticated) {
  const login = byId('admin-login-section');
  const editor = byId('admin-editor-section');
  const targets = byId('admin-targets-section');
  if (login) login.hidden = authenticated;
  if (editor) editor.hidden = !authenticated;
  if (targets) targets.hidden = !authenticated;
}

export function createAdminController() {
  let configured = false;
  let authenticated = false;
  let dirtyAfterSave = false;

  function updateApplyUi() {
    const applyBtn = byIdAs('btn-admin-apply');
    if (applyBtn) {
      applyBtn.disabled = !dirtyAfterSave;
      applyBtn.title = dirtyAfterSave
        ? 'Reload the page to use the saved defaults'
        : 'Save config first';
    }
  }

  function updateDeleteButton() {
    const btn = byIdAs('btn-admin-targets-delete');
    const list = byId('admin-targets-list');
    if (!btn || !list) return;
    const checked = list.querySelectorAll(
      'input[data-role="admin-target-check"]:checked'
    );
    btn.disabled = checked.length === 0;
  }

  /**
   * @param {{ adminConfigured?: boolean }} config
   */
  function init(config) {
    configured = Boolean(config.adminConfigured);
    const tab = byId('tab-admin');
    const panel = byId('panel-admin');
    if (tab) tab.hidden = !configured;
    if (panel && !configured) panel.hidden = true;
    if (!configured) return;

    void refreshSession();
  }

  async function refreshSession() {
    const { res, body } = await adminFetch('/api/admin/session');
    if (!res.ok) {
      authenticated = false;
      setGate(false);
      return;
    }
    authenticated = Boolean(body.authenticated);
    setGate(authenticated);
    if (authenticated) {
      await loadConfigForm();
      await loadTargetsList();
    }
  }

  async function loadConfigForm() {
    const { res, body } = await adminFetch('/api/admin/config');
    if (res.status === 401) {
      authenticated = false;
      setGate(false);
      return;
    }
    if (!res.ok) {
      setFieldError(
        'admin-error',
        typeof body.error === 'string' ? body.error : 'Could not load config.'
      );
      return;
    }
    setFieldError('admin-error', '');
    if (body.defaults && typeof body.defaults === 'object') {
      fillForm(/** @type {Record<string, unknown>} */ (body.defaults));
    }
  }

  async function loadTargetsList() {
    const list = byId('admin-targets-list');
    const empty = byId('admin-targets-empty');
    if (!list) return;
    setFieldError('admin-targets-error', '');
    setStatusMessage('admin-targets-success', '');

    const { res, body } = await adminFetch('/api/targets');
    if (res.status === 401) {
      authenticated = false;
      setGate(false);
      return;
    }
    if (!res.ok) {
      setFieldError(
        'admin-targets-error',
        typeof body.error === 'string'
          ? body.error
          : 'Could not load saved files.'
      );
      return;
    }

    const targets = Array.isArray(body.targets)
      ? /** @type {Array<{ id: string, title: string, category: string, createdAt: string }>} */ (
          body.targets
        )
      : [];
    list.replaceChildren();
    if (empty) empty.hidden = targets.length > 0;

    for (const item of targets) {
      const row = document.createElement('article');
      row.className = 'admin-target-row';
      row.dataset.id = item.id;
      row.setAttribute('role', 'listitem');

      const checkLabel = document.createElement('label');
      checkLabel.className = 'admin-target-check';
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.dataset.role = 'admin-target-check';
      check.value = item.id;
      check.addEventListener('change', updateDeleteButton);
      checkLabel.append(check);

      const fields = document.createElement('div');
      fields.className = 'admin-target-fields';

      const titleField = document.createElement('label');
      titleField.className = 'field';
      const titleLabel = document.createElement('span');
      titleLabel.className = 'field-label';
      titleLabel.textContent = 'Title';
      const titleInput = document.createElement('input');
      titleInput.type = 'text';
      titleInput.value = item.title || '';
      titleInput.dataset.field = 'title';
      titleInput.autocomplete = 'off';
      titleField.append(titleLabel, titleInput);

      const catField = document.createElement('label');
      catField.className = 'field';
      const catLabel = document.createElement('span');
      catLabel.className = 'field-label';
      catLabel.textContent = 'Category';
      const catInput = document.createElement('input');
      catInput.type = 'text';
      catInput.value = item.category || '';
      catInput.dataset.field = 'category';
      catInput.autocomplete = 'off';
      catField.append(catLabel, catInput);

      fields.append(titleField, catField);

      const meta = document.createElement('p');
      meta.className = 'hint hint-tight';
      meta.textContent = item.createdAt || '';

      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'btn btn-quiet';
      saveBtn.textContent = 'Save meta';
      saveBtn.addEventListener('click', () => {
        void saveTargetMeta(item.id, titleInput.value, catInput.value);
      });

      row.append(checkLabel, fields, meta, saveBtn);
      list.append(row);
    }

    updateDeleteButton();
  }

  /**
   * @param {string} id
   * @param {string} title
   * @param {string} category
   */
  async function saveTargetMeta(id, title, category) {
    setFieldError('admin-targets-error', '');
    setStatusMessage('admin-targets-success', '');
    const { res, body } = await adminFetch(`/api/targets/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ title, category }),
    });
    if (res.status === 401) {
      authenticated = false;
      setGate(false);
      setFieldError('admin-login-error', 'Session expired. Log in again.');
      return;
    }
    if (!res.ok) {
      setFieldError(
        'admin-targets-error',
        typeof body.error === 'string'
          ? body.error
          : 'Could not update that file.'
      );
      return;
    }
    setStatusMessage('admin-targets-success', 'Title and category saved.');
    await loadTargetsList();
  }

  async function deleteSelectedTargets() {
    const list = byId('admin-targets-list');
    if (!list) return;
    const checked = [
      ...list.querySelectorAll('input[data-role="admin-target-check"]:checked'),
    ];
    const ids = checked
      .map((el) => (el instanceof HTMLInputElement ? el.value : ''))
      .filter(Boolean);
    if (ids.length === 0) return;

    const ok = await confirmAction(
      `Delete ${ids.length} saved target file${ids.length === 1 ? '' : 's'}? This cannot be undone.`,
      {
        title: 'Delete saved files',
        confirmLabel: 'Delete',
        cancelLabel: 'Cancel',
      }
    );
    if (!ok) return;

    setFieldError('admin-targets-error', '');
    setStatusMessage('admin-targets-success', '');
    const { res, body } = await adminFetch('/api/admin/targets/delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
    if (res.status === 401) {
      authenticated = false;
      setGate(false);
      setFieldError('admin-login-error', 'Session expired. Log in again.');
      return;
    }
    if (!res.ok) {
      setFieldError(
        'admin-targets-error',
        typeof body.error === 'string'
          ? body.error
          : 'Could not delete selected files.'
      );
      return;
    }
    const deleted = Array.isArray(body.deleted) ? body.deleted.length : ids.length;
    setStatusMessage(
      'admin-targets-success',
      `Deleted ${deleted} file${deleted === 1 ? '' : 's'}.`
    );
    await loadTargetsList();
  }

  function wireForms() {
    const loginForm = byIdAs('form-admin-login');
    loginForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      void onLogin();
    });

    const logoutBtn = byIdAs('btn-admin-logout');
    logoutBtn?.addEventListener('click', () => {
      void onLogout();
    });

    const configForm = byIdAs('form-admin-config');
    configForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      void onSave();
    });

    const applyBtn = byIdAs('btn-admin-apply');
    applyBtn?.addEventListener('click', () => {
      window.location.reload();
    });

    const reloadBtn = byIdAs('btn-admin-reload');
    reloadBtn?.addEventListener('click', () => {
      void loadConfigForm();
      dirtyAfterSave = false;
      setStatusMessage('admin-success', '');
      updateApplyUi();
    });

    const refreshTargets = byIdAs('btn-admin-targets-refresh');
    refreshTargets?.addEventListener('click', () => {
      void loadTargetsList();
    });

    const deleteBtn = byIdAs('btn-admin-targets-delete');
    deleteBtn?.addEventListener('click', () => {
      void deleteSelectedTargets();
    });

    updateApplyUi();
    updateDeleteButton();
  }

  async function onLogin() {
    setFieldError('admin-login-error', '');
    const username = byIdAs('admin-username')?.value.trim() || '';
    const password = byIdAs('admin-password')?.value || '';
    const btn = byIdAs('btn-admin-login');
    if (btn) {
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
    }
    try {
      const { res, body } = await adminFetch('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        setFieldError(
          'admin-login-error',
          typeof body.error === 'string'
            ? body.error
            : 'Login failed.'
        );
        return;
      }
      authenticated = true;
      setGate(true);
      const pwd = byIdAs('admin-password');
      if (pwd) pwd.value = '';
      await loadConfigForm();
      await loadTargetsList();
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
      }
    }
  }

  async function onLogout() {
    await adminFetch('/api/admin/logout', { method: 'POST', body: '{}' });
    authenticated = false;
    dirtyAfterSave = false;
    setGate(false);
    setStatusMessage('admin-success', '');
    setFieldError('admin-error', '');
    setStatusMessage('admin-targets-success', '');
    setFieldError('admin-targets-error', '');
    updateApplyUi();
  }

  async function onSave() {
    setFieldError('admin-error', '');
    setStatusMessage('admin-success', '');
    const patch = readFormPatch();
    const btn = byIdAs('btn-admin-save');
    if (btn) {
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
    }
    try {
      const { res, body } = await adminFetch('/api/admin/config', {
        method: 'PUT',
        body: JSON.stringify(patch),
      });
      if (res.status === 401) {
        authenticated = false;
        setGate(false);
        setFieldError('admin-login-error', 'Session expired. Log in again.');
        return;
      }
      if (!res.ok) {
        setFieldError(
          'admin-error',
          typeof body.error === 'string' ? body.error : 'Could not save config.'
        );
        return;
      }
      if (body.defaults && typeof body.defaults === 'object') {
        fillForm(/** @type {Record<string, unknown>} */ (body.defaults));
      }
      dirtyAfterSave = true;
      updateApplyUi();
      setStatusMessage(
        'admin-success',
        typeof body.message === 'string'
          ? body.message
          : 'Config saved. Click Apply & reload to use the new defaults.'
      );
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
      }
    }
  }

  return {
    init,
    wireForms,
    isConfigured: () => configured,
  };
}
