// Chooses the UI variant: v2 is the default; ?ui=classic restores the previous layout and ?ui=v2 switches back.
// The choice is remembered in this browser. The key changed when v2 became the default so that earlier
// A/B choices do not pin visitors to the old layout.
(() => {
  const KEY = 'mapviewer.ui.v2default';
  const variants = ['classic', 'v2'];
  let variant = 'v2';
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
