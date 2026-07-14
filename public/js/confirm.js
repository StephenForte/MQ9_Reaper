/**
 * Operator confirm dialog (styled). Falls back to window.confirm if DOM missing.
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

  return new Promise((resolve) => {
    const existing = document.getElementById('app-confirm');
    if (existing) existing.remove();

    const root = document.createElement('div');
    root.id = 'app-confirm';
    root.className = 'confirm-overlay';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'app-confirm-title');

    const panel = document.createElement('div');
    panel.className = 'confirm-panel';

    const heading = document.createElement('h2');
    heading.id = 'app-confirm-title';
    heading.className = 'confirm-title';
    heading.textContent = title;

    const body = document.createElement('p');
    body.className = 'confirm-body';
    body.textContent = message;

    const actions = document.createElement('div');
    actions.className = 'confirm-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn';
    cancelBtn.textContent = cancelLabel;

    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'btn btn-primary';
    okBtn.textContent = confirmLabel;

    const finish = (value) => {
      root.remove();
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };

    const onKey = (event) => {
      if (event.key === 'Escape') finish(false);
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    cancelBtn.addEventListener('click', () => finish(false));
    okBtn.addEventListener('click', () => finish(true));
    root.addEventListener('click', (event) => {
      if (event.target === root) finish(false);
    });
    document.addEventListener('keydown', onKey);

    actions.append(cancelBtn, okBtn);
    panel.append(heading, body, actions);
    root.append(panel);
    document.body.append(root);
    okBtn.focus();
  });
}
