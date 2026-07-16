/**
 * Tab shell (Target Selection | Upload to Reaper | BDA | Admin).
 * Skips tabs with the hidden attribute (e.g. Admin when not configured).
 * @param {{
 *   onActivate: (tab: string) => void
 * }} options
 */
export function wireTabs({ onActivate }) {
  /**
   * @returns {HTMLElement[]}
   */
  function visibleTabs() {
    return [...document.querySelectorAll('.tab')].filter(
      (tab) => tab instanceof HTMLElement && !tab.hidden
    );
  }

  document.querySelectorAll('.tab').forEach((tab) => {
    if (!(tab instanceof HTMLElement)) return;

    tab.addEventListener('click', () => {
      if (tab.hidden) return;
      setActiveTab(tab.dataset.tab || 'select');
    });

    tab.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const tabs = visibleTabs();
      const index = tabs.indexOf(tab);
      if (index < 0) return;
      const next =
        event.key === 'ArrowRight'
          ? tabs[(index + 1) % tabs.length]
          : tabs[(index - 1 + tabs.length) % tabs.length];
      next.focus();
      setActiveTab(next.dataset.tab || 'select');
    });
  });

  /**
   * @param {string} tabName
   */
  function setActiveTab(tabName) {
    document.querySelectorAll('.tab').forEach((tab) => {
      if (!(tab instanceof HTMLElement)) return;
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
