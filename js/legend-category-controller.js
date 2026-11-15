const ICON_ISOLATE = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3"/></svg>';

export function createLegendCategoryController({
  document,
  map,
  setLayerVisibility,
  updateScaleState
}) {
  function setClassFilters(ids, state) {
    const conditions = [...state.hidden].map(category => ['!', category.test]);
    ids.forEach(id => {
      const original = state.orig[id];
      map.setFilter(id, conditions.length
        ? original ? ['all', original, ...conditions] : ['all', ...conditions]
        : original || null);
    });
  }

  function applyEntry(entry, on) {
    if (!entry.cls) return setLayerVisibility(entry.ids, on);
    entry.isolationController?.clear();
    if (entry.checkbox) entry.checkbox.checked = on;
    const state = entry.state;
    on ? state.hidden.delete(entry.cls) : state.hidden.add(entry.cls);
    setClassFilters(entry.ids, state);
    setLayerVisibility(entry.ids, state.hidden.size < state.total);
    updateScaleState();
  }

  function createIsolationStatus() {
    const element = document.createElement('div');
    element.className = 'category-isolation-status';
    element.hidden = true;
    element.setAttribute('role', 'status');
    const message = document.createElement('span');
    const restore = document.createElement('button');
    restore.type = 'button';
    restore.textContent = 'Restore previous';
    element.append(message, restore);
    return { element, message, restore };
  }

  function createIsolationController(status, onChange) {
    let active = null;
    const refresh = (record, isolated) => {
      const { state } = record;
      setClassFilters(record.ids, state);
      setLayerVisibility(record.ids, state.hidden.size < state.total);
      updateScaleState();
      record.entries.forEach(entry => {
        if (entry.checkbox) entry.checkbox.checked = !state.hidden.has(entry.category);
        if (entry.button) {
          const selected = isolated && entry.category === record.category;
          entry.button.setAttribute('aria-pressed', String(selected));
          entry.button.title = selected
            ? 'Restore previous category selection'
            : `Show only ${entry.category.text}`;
          entry.button.setAttribute('aria-label', entry.button.title);
        }
      });
      status.message.textContent = isolated ? `Showing only: ${record.category.text}` : '';
      status.element.hidden = !isolated;
      record.onChange?.();
    };
    const restore = () => {
      if (!active) return;
      const previous = active;
      active = null;
      previous.state.hidden = new Set(previous.hiddenBefore);
      refresh(previous, false);
    };
    status.restore.onclick = restore;

    return {
      clear: restore,
      isolate(category, state, entries, ids, categoryChange) {
        if (active?.state === state && active.category === category) {
          restore();
          return;
        }
        const hiddenBefore = active?.state === state
          ? active.hiddenBefore
          : new Set(state.hidden);
        if (active && active.state !== state) restore();
        active = { category, state, entries, ids, hiddenBefore, onChange: categoryChange };
        state.hidden = new Set(entries.filter(entry => entry.category !== category).map(entry => entry.category));
        refresh(active, true);
      }
    };
  }

  function createIsolationButton(category, controller, state, entries, ids, onChange) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'category-isolate';
    button.innerHTML = ICON_ISOLATE;
    button.title = `Show only ${category.text}`;
    button.setAttribute('aria-label', button.title);
    button.setAttribute('aria-pressed', 'false');
    button.onclick = event => {
      event.preventDefault();
      event.stopPropagation();
      controller.isolate(category, state, entries, ids, onChange);
    };
    return button;
  }

  return {
    setClassFilters,
    applyEntry,
    createIsolationStatus,
    createIsolationController,
    createIsolationButton
  };
}
