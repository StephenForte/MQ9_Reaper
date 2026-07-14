/**
 * Operator confirm dialog (styled overlay).
 * @param {string} message
 * @param {{ title?: string, confirmLabel?: string, cancelLabel?: string }} [opts]
 * @returns {Promise<boolean>}
 */
export function confirmAction(message, opts = {}) {
  const {
    title = 'Confirm',
    confirmLabel = 'Continue',
    cancelLabel = 'Cancel',
  } = opts;

  return chooseAction(message, {
    title,
    primaryLabel: confirmLabel,
    cancelLabel,
  }).then((choice) => choice === 'primary');
}

/**
 * Three-way (or two-way) operator choice dialog.
 * @param {string} message
 * @param {{
 *   title?: string,
 *   primaryLabel?: string,
 *   secondaryLabel?: string,
 *   cancelLabel?: string,
 * }} [opts]
 * @returns {Promise<'primary' | 'secondary' | 'cancel'>}
 */
export function chooseAction(message, opts = {}) {
  const {
    title = 'Confirm',
    primaryLabel = 'Continue',
    secondaryLabel,
    cancelLabel = 'Cancel',
  } = opts;

  return new Promise((resolve) => {
    const existing = document.getElementById('app-confirm');
    if (existing) existing.remove();

    const root = document.createElement('div');
    root.id = 'app-confirm';
    root.className = 'confirm-overlay';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'app-confirm-title');
    root.setAttribute('aria-describedby', 'app-confirm-body');

    const panel = document.createElement('div');
    panel.className = 'confirm-panel';

    const heading = document.createElement('h2');
    heading.id = 'app-confirm-title';
    heading.className = 'confirm-title';
    heading.textContent = title;

    const body = document.createElement('p');
    body.id = 'app-confirm-body';
    body.className = 'confirm-body';
    body.textContent = message;

    const actions = document.createElement('div');
    actions.className = 'confirm-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn';
    cancelBtn.textContent = cancelLabel;

    /** @type {HTMLButtonElement | null} */
    let secondaryBtn = null;
    if (secondaryLabel) {
      secondaryBtn = document.createElement('button');
      secondaryBtn.type = 'button';
      secondaryBtn.className = 'btn';
      secondaryBtn.textContent = secondaryLabel;
    }

    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'btn btn-primary';
    okBtn.textContent = primaryLabel;

    /**
     * @param {'primary' | 'secondary' | 'cancel'} value
     */
    const finish = (value) => {
      root.remove();
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };

    const focusables = () => {
      /** @type {HTMLButtonElement[]} */
      const nodes = [cancelBtn];
      if (secondaryBtn) nodes.push(secondaryBtn);
      nodes.push(okBtn);
      return nodes;
    };

    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish('cancel');
        return;
      }
      if (event.key === 'Enter' && document.activeElement !== cancelBtn) {
        event.preventDefault();
        if (document.activeElement === secondaryBtn) {
          finish('secondary');
          return;
        }
        finish('primary');
        return;
      }
      if (event.key !== 'Tab') return;
      const nodes = focusables();
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    cancelBtn.addEventListener('click', () => finish('cancel'));
    secondaryBtn?.addEventListener('click', () => finish('secondary'));
    okBtn.addEventListener('click', () => finish('primary'));
    root.addEventListener('click', (event) => {
      if (event.target === root) finish('cancel');
    });
    document.addEventListener('keydown', onKey);

    if (secondaryBtn) {
      actions.append(cancelBtn, secondaryBtn, okBtn);
    } else {
      actions.append(cancelBtn, okBtn);
    }
    panel.append(heading, body, actions);
    root.append(panel);
    document.body.append(root);
    okBtn.focus();
  });
}
