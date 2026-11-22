// Chooses the UI variant for A/B testing: ?ui=v2 or ?ui=classic (remembered in this browser).
(() => {
  const KEY = 'mapviewer.ui';
  const variants = ['classic', 'v2'];
  let variant = 'classic';
  try {
    const requested = new URLSearchParams(window.location.search).get('ui');
    if (variants.includes(requested)) window.localStorage.setItem(KEY, requested);
    const stored = window.localStorage.getItem(KEY);
    if (variants.includes(stored)) variant = stored;
  } catch {
    const requested = new URLSearchParams(window.location.search).get('ui');
    if (variants.includes(requested)) variant = requested;
  }
  document.documentElement.dataset.ui = variant;
})();
