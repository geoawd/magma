(() => {
  const KEY = 'mapviewer.theme.v1';
  const THEMES = ['light', 'dark'];
  let theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  try {
    const saved = localStorage.getItem(KEY);
    if (THEMES.includes(saved)) theme = saved;
  } catch { /* The system preference remains available when storage is disabled. */ }

  function applyTheme(value) {
    theme = value;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      'content',
      theme === 'dark' ? '#1b252b' : '#f3f6f8'
    );
    document.querySelectorAll('[data-theme-choice]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.themeChoice === theme));
    });
  }

  applyTheme(theme);
  document.addEventListener('DOMContentLoaded', () => applyTheme(theme), { once: true });
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-theme-choice]');
    if (!button || !THEMES.includes(button.dataset.themeChoice)) return;
    applyTheme(button.dataset.themeChoice);
    try { localStorage.setItem(KEY, theme); } catch { /* The selected theme still applies for this page. */ }
  });
  window.addEventListener('storage', event => {
    if (event.key !== KEY) return;
    if (THEMES.includes(event.newValue)) applyTheme(event.newValue);
    else applyTheme(matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  });
  const colorScheme = matchMedia('(prefers-color-scheme: dark)');
  colorScheme.addEventListener('change', event => {
    try {
      if (THEMES.includes(localStorage.getItem(KEY))) return;
    } catch { /* Use the system preference when storage is disabled. */ }
    applyTheme(event.matches ? 'dark' : 'light');
  });
})();
