export function createGeojsonLegendController({
  document,
  loaders,
  geometryKinds,
  colorClasses,
  escapeHtml,
  sanitizeColor,
  createCategoryIsolationStatus,
  createCategoryIsolationController,
  categoryIsolationButton,
  applyEntry
}) {
  const inViewGroups = [];

  function symbolKinds(overlay, geometryTypes) {
    const kinds = new Set();
    const types = geometryTypes?.size
      ? geometryTypes
      : Array.isArray(overlay.geometryType) ? overlay.geometryType : [overlay.geometryType];
    types.forEach(type => {
      if (geometryKinds[type]) kinds.add(geometryKinds[type]);
    });
    if (!kinds.size) {
      if (Number.isFinite(overlay.style?.radius)) kinds.add('point');
      else if (overlay.style?.fill !== undefined) kinds.add('polygon');
      else kinds.add('line');
    }
    return [...kinds];
  }

  function swatch(overlay, classColor, geometryTypes) {
    const style = overlay.style || {};
    const fillExpression = Array.isArray(style.fill) && ['match', 'step'].includes(style.fill[0]);
    const color = sanitizeColor(fillExpression ? style.color : classColor ?? style.color, '#d9480f');
    const fill = sanitizeColor(typeof style.fill === 'string' ? style.fill : classColor ?? style.color, '#d9480f');
    const width = Number.isFinite(style.width) ? Math.max(1, style.width) : 2;
    const diameter = Number.isFinite(style.radius) ? Math.max(6, Math.min(14, style.radius * 2)) : 10;
    const lineStyle = Array.isArray(style.dasharray) && style.dasharray.length ? 'dashed' : 'solid';
    const opacity = Number.isFinite(overlay.opacity) ? Math.max(0, Math.min(1, overlay.opacity)) : 1;
    const kinds = symbolKinds(overlay, geometryTypes);
    const mixed = kinds.length > 1;
    const lineWidth = mixed ? 8 : 16;
    const pointSize = mixed ? 7 : diameter;
    const polygonWidth = mixed ? 8 : 16;
    const polygonHeight = mixed ? 9 : 12;
    const symbols = [
      kinds.includes('polygon')
        ? `<i class="geojson-polygon" style="width:${polygonWidth}px;height:${polygonHeight}px;background:${fill};opacity:${opacity}"></i>`
        : '',
      kinds.includes('line')
        ? `<i class="geojson-line" style="width:${lineWidth}px;border-top:${width}px ${lineStyle} ${color};opacity:${opacity}"></i>`
        : '',
      kinds.includes('point')
        ? `<i class="geojson-point" style="width:${pointSize}px;height:${pointSize}px;background:${fill};border:${width}px solid ${color};opacity:${opacity}"></i>`
        : ''
    ].join('');
    return `<span class="sw geojson-swatch${mixed ? ' geojson-swatch-mixed' : ''}" aria-hidden="true">${symbols}</span>`;
  }

  function categories(overlay, loader) {
    const style = overlay.style || {};
    const fillExpression = Array.isArray(style.fill) && ['match', 'step'].includes(style.fill[0]);
    const parsed = colorClasses({
      type: 'line',
      paint: { 'line-color': fillExpression ? style.fill : style.color }
    }, true);
    const configured = !loader.advancedStyle && Array.isArray(overlay.legend?.entries)
      ? overlay.legend.entries
      : null;
    if (parsed) {
      const entries = parsed.map((category, index) => ({
        ...category,
        text: loader.classification?.method === 'tellus_percentile'
          ? loader.classification.percentileLabels[index] || category.text
          : configured?.[index]?.label || category.text,
        color: configured?.[index]?.color || category.color
      }));
      return loader.classification?.method === 'tellus_percentile' &&
        loader.classification.legendDescending ? entries.reverse() : entries;
    }
    if (configured) {
      return configured.filter(entry => entry && typeof entry.label === 'string' && typeof entry.color === 'string')
        .map(entry => ({ text: entry.label, color: entry.color, test: null }));
    }
    const staticColor = typeof style.fill === 'string' ? style.fill : typeof style.color === 'string' ? style.color : null;
    return staticColor
      ? [{ text: overlay.name || overlay.id, color: staticColor, test: null }]
      : [];
  }

  function render(overlay) {
    const loader = loaders.get(overlay.id);
    const container = loader?.legendContainer;
    if (!container) return;
    container.replaceChildren();
    const title = loader.advancedStyle ? loader.classification?.field : overlay.legend?.title;
    if (typeof title === 'string' && title.trim()) {
      const heading = document.createElement('div');
      heading.className = 'geojson-legend-title';
      const percentileClassification = loader.classification?.method === 'tellus_percentile';
      if (percentileClassification) {
        const label = document.createElement('span');
        label.textContent = title;
        const sortButton = document.createElement('button');
        const updateSortButton = () => {
          const descending = loader.classification.legendDescending === true;
          sortButton.textContent = descending ? '↓' : '↑';
          sortButton.setAttribute('aria-label',
            descending ? 'Show lowest percentiles first' : 'Show highest percentiles first');
          sortButton.title = sortButton.getAttribute('aria-label');
        };
        sortButton.type = 'button';
        sortButton.className = 'geojson-percentile-sort';
        sortButton.onclick = () => {
          loader.classification.legendDescending = !loader.classification.legendDescending;
          [...container.querySelectorAll('.geojson-class-entry')].reverse()
            .forEach(entry => container.appendChild(entry));
          updateSortButton();
        };
        updateSortButton();
        heading.append(label, sortButton);
      } else {
        heading.textContent = title;
      }
      container.appendChild(heading);
    }

    inViewGroups.splice(0, inViewGroups.length,
      ...inViewGroups.filter(group => group.sl !== overlay.id));
    const legendCategories = categories(overlay, loader);
    const filterCategories = legendCategories.filter(category => category.test);
    const ids = overlay.layerIds || [overlay.id];
    loader.classState = filterCategories.length ? {
      hidden: new Set(),
      total: filterCategories.length,
      categories: filterCategories,
      orig: loader.originalFilters
    } : null;
    loader.classInputs = [];
    loader.categoryIsolationController = null;
    const isolationStatus = filterCategories.length ? createCategoryIsolationStatus() : null;
    const isolationEntries = [];
    const inViewItems = [];
    const filterInView = overlay.filterlegend === true &&
      filterCategories.length > 0 && filterCategories.every(category => category.field);
    let inViewNote = null;
    if (filterInView) {
      inViewNote = document.createElement('div');
      inViewNote.className = 'hint lnote';
      container.appendChild(inViewNote);
    }
    const syncCategoryVisibility = () => {
      const anyVisible = loader.classState.hidden.size < loader.classState.total;
      if (loader.rootCheckbox) loader.rootCheckbox.checked = anyVisible;
      loader.rowElement?.classList.toggle('legend-off', !anyVisible);
    };
    if (isolationStatus) {
      container.appendChild(isolationStatus.element);
      loader.categoryIsolationController = createCategoryIsolationController(
        isolationStatus, syncCategoryVisibility
      );
    }
    legendCategories.forEach(category => {
      const entry = document.createElement('div');
      entry.className = 'ent geojson-class-entry';
      if (!category.test) entry.classList.add('static');
      const label = document.createElement('label');
      label.className = 'geojson-class-toggle';
      label.innerHTML = `${category.test ? '<input type="checkbox" checked>' : ''}${swatch(overlay, category.color, loader.geometryTypes)}<span>${escapeHtml(category.text)}</span>`;
      entry.appendChild(label);
      const input = label.querySelector('input');
      if (input) {
        const state = loader.classState;
        if (filterInView) inViewItems.push({ lab: entry, category, cb: input });
        const control = { category, checkbox: input, button: null };
        isolationEntries.push(control);
        if (loader.categoryIsolationController) {
          control.button = categoryIsolationButton(
            category, loader.categoryIsolationController, state, isolationEntries, ids, syncCategoryVisibility
          );
          entry.appendChild(control.button);
        }
        input.onchange = () => {
          applyEntry({
            ids, cls: category, state, checkbox: input,
            isolationController: loader.categoryIsolationController
          }, input.checked);
          syncCategoryVisibility();
        };
        loader.classInputs.push(input);
      }
      container.appendChild(entry);
    });
    if (filterInView) {
      inViewGroups.push({
        sl: overlay.id,
        source: overlay.id,
        queryLayers: ids,
        gcb: loader.rootCheckbox,
        items: inViewItems,
        note: inViewNote,
        visibleCategories: new Set()
      });
    }
    container.hidden = !container.childElementCount;
  }

  return { categories, render, swatch, inViewGroups };
}
