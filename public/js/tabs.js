/**
 * Two-tab shell (Target Selection | Review).
 * @param {{
 *   onActivate: (tab: 'select' | 'review') => void
 * }} options
 */
export function wireTabs({ onActivate }) {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      setActiveTab(/** @type {'select' | 'review'} */ (tab.dataset.tab || 'select'));
    });

    tab.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const tabs = [...document.querySelectorAll('.tab')];
      const index = tabs.indexOf(tab);
      if (index < 0) return;
      const next =
        event.key === 'ArrowRight'
          ? tabs[(index + 1) % tabs.length]
          : tabs[(index - 1 + tabs.length) % tabs.length];
      /** @type {HTMLElement} */ (next).focus();
      setActiveTab(
        /** @type {'select' | 'review'} */ (
          /** @type {HTMLElement} */ (next).dataset.tab || 'select'
        )
      );
    });
  });

  /**
   * @param {'select' | 'review'} tabName
   */
  function setActiveTab(tabName) {
    document.querySelectorAll('.tab').forEach((tab) => {
      const active = tab.dataset.tab === tabName;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      tab.setAttribute('tabindex', active ? '0' : '-1');
    });

    document.querySelectorAll('.panel').forEach((panel) => {
      const active = panel.id === `panel-${tabName}`;
      panel.classList.toggle('is-active', active);
      panel.hidden = !active;
    });

    onActivate(tabName);
  }

  return { setActiveTab };
}
