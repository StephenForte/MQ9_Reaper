import { byId, byIdAs } from './dom.js';
import { setFieldError, setStatusMessage } from './ui.js';

/**
 * Admin tab: login + edit §6 config. Save writes the active config file;
 * Apply & reload picks up new defaults in this browser.
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
  if (login) login.hidden = authenticated;
  if (editor) editor.hidden = !authenticated;
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

    updateApplyUi();
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
