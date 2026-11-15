export function createVectorLegendController({
  map,
  document,
  window,
  config,
  getLegendElement,
  addGroup,
  styleLayerKey,
  colorClasses,
  styleLayerLabel,
  layerTools,
  infoFor,
  setTransparency,
  zoomButton,
  vectorLayerBounds,
  collapser,
  categoryController,
  swatch,
  formatFilter,
  escapeHtml,
  registerLayerVisibility,
  setLayerVisibility,
  setThemeVisibility,
  controls,
  inViewGroups
}) {
  function build() {
    inViewGroups.length = 0;
    const style = map.getStyle();
    const sourceLayers = [...new Set(style.layers.filter(layer => layer['source-layer']).map(styleLayerKey))];
    const groups = (style.metadata && style.metadata['legend-groups']) || [{ name: 'Layers', layers: sourceLayers }];
    window.LEGEND_GROUP_LAYERS = {};
    groups.forEach(group => {
      window.LEGEND_GROUP_LAYERS[group.name] = [...new Set([
        ...(window.LEGEND_GROUP_LAYERS[group.name] || []), ...(group.layers || [])
      ])];
    });

    const legend = getLegendElement();
    legend.innerHTML = '';
    groups.forEach(groupConfig => {
      const group = addGroup(legend, groupConfig.name);
      groupConfig.layers.forEach(sourceLayer => {
        const initiallyVisible = (config.layerDefaults || {})[sourceLayer] === true;
        const entries = [];
        style.layers.filter(layer => styleLayerKey(layer) === sourceLayer).forEach(layer => {
          const paint = layer.paint || {};
          const isDot = (layer.type === 'circle' && paint['circle-color'] === '#000000' && (paint['circle-radius'] || 0) < 2.5)
            || (layer.type === 'fill' && paint['fill-opacity'] === 0);
          if (isDot && entries.length) {
            entries[entries.length - 1].ids.push(layer.id);
            entries[entries.length - 1].dot = true;
          } else entries.push({ l: layer, ids: [layer.id], dot: false });
        });

        const expanded = [];
        entries.forEach(entry => {
          const classes = colorClasses(entry.l);
          if (!classes) return expanded.push(entry);
          const state = {
            hidden: initiallyVisible ? new Set() : new Set(classes),
            total: classes.length,
            orig: {}
          };
          entry.ids.forEach(id => {
            state.orig[id] = (style.layers.find(layer => layer.id === id) || {}).filter;
          });
          classes.forEach(category => expanded.push({ ...entry, cls: category, state }));
        });

        const layerElement = document.createElement('div');
        layerElement.dataset.sl = sourceLayer;
        layerElement.dataset.orderKey = `layer:${sourceLayer}`;
        layerElement.classList.toggle('legend-off', !initiallyVisible);
        layerElement.draggable = true;
        const labelText = styleLayerLabel(style, sourceLayer);
        layerElement.title = `Drag to reorder ${labelText}`;
        const groupCheckbox = document.createElement('label');
        groupCheckbox.className = 'grp lname';
        groupCheckbox.innerHTML = `<input type="checkbox"${initiallyVisible ? ' checked' : ''}> <span>${escapeHtml(labelText)}</span><svg class="eye" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/><line x1="3" y1="21" x2="21" y2="3"/></svg>`;
        const row = document.createElement('div');
        row.className = 'grprow';
        const tools = layerTools(0, infoFor(sourceLayer, groupConfig.name), value => setTransparency(sourceLayer, value));
        const sourceLayerStyle = style.layers.find(layer => styleLayerKey(layer) === sourceLayer);
        const extentButton = zoomButton(labelText, () => vectorLayerBounds(sourceLayerStyle, style));
        row.append(collapser(layerElement, config.collapseLayers), groupCheckbox, extentButton,
          ...(tools.infoBtn ? [tools.infoBtn] : []), tools.btn);
        layerElement.append(row, ...(tools.infoPanel ? [tools.infoPanel] : []), tools.panel);

        const boxes = [];
        const classEntries = expanded.filter(entry => entry.cls);
        const classToggles = config.classToggles || {};
        const toggleClasses = classToggles[sourceLayer] ?? classToggles['*'] ?? true;
        const filterInView = config.filterlegend?.[sourceLayer] === true &&
          classEntries.length > 0 && classEntries.every(entry => entry.cls.field);
        const allowToggle = (sourceLayer in classToggles ? classToggles[sourceLayer] : classToggles['*']) !== false;
        const items = [];
        let note = null;
        if (filterInView) {
          note = document.createElement('div');
          note.className = 'hint lnote';
          layerElement.appendChild(note);
        }
        const isolationStatus = classEntries.length ? categoryController.createIsolationStatus() : null;
        const isolationEntries = new Map();
        const isolationController = isolationStatus
          ? categoryController.createIsolationController(isolationStatus)
          : null;
        if (isolationStatus) layerElement.appendChild(isolationStatus.element);
        expanded.forEach(entry => {
          const itemElement = document.createElement('div');
          const toggleEntry = !entry.cls || toggleClasses;
          itemElement.className = 'ent' + (toggleEntry ? '' : ' static');
          const labels = config.legendLabels || {};
          const text = entry.cls
            ? labels[`${entry.l.id}|${entry.cls.text}`] ?? labels[entry.cls.text] ??
              (entry.cls.text === '__null__' ? '(no value)' : entry.cls.text)
            : labels[entry.l.id] || formatFilter(entry.l.filter) || entry.l.id;
          const label = document.createElement('label');
          label.className = 'ent-toggle';
          label.innerHTML = `${toggleEntry ? `<input type="checkbox"${initiallyVisible ? ' checked' : ''}>` : ''}${swatch(entry.l, entry.dot, entry.cls && entry.cls.color)}<span>${escapeHtml(text)}</span>`;
          itemElement.appendChild(label);
          const checkbox = label.querySelector('input');
          if (!allowToggle) itemElement.classList.add('static');
          if (checkbox) {
            entry.checkbox = checkbox;
            entry.isolationController = isolationController;
            checkbox.onchange = () => categoryController.applyEntry(entry, checkbox.checked);
            boxes.push({ checkbox, entry });
          }
          if (entry.cls && checkbox && allowToggle) {
            let stateEntries = isolationEntries.get(entry.state);
            if (!stateEntries) {
              stateEntries = [];
              isolationEntries.set(entry.state, stateEntries);
            }
            const control = { category: entry.cls, checkbox, button: null };
            stateEntries.push(control);
            control.button = categoryController.createIsolationButton(
              entry.cls, isolationController, entry.state, stateEntries, Object.keys(entry.state.orig)
            );
            itemElement.appendChild(control.button);
          }
          if (filterInView && entry.cls) items.push({ lab: itemElement, en: entry, cb: checkbox });
          layerElement.appendChild(itemElement);
        });

        const groupInput = groupCheckbox.querySelector('input');
        const classIds = [...new Set(classEntries.flatMap(entry => entry.ids))];
        const setAll = on => {
          isolationController?.clear();
          groupInput.checked = on;
          layerElement.classList.toggle('legend-off', !on);
          boxes.forEach(({ checkbox, entry }) => {
            checkbox.checked = on;
            categoryController.applyEntry(entry, on);
          });
          if (!toggleClasses) setLayerVisibility(classIds, on);
        };
        groupInput.onchange = () => setAll(groupInput.checked);
        const ids = [...new Set(style.layers.filter(layer => styleLayerKey(layer) === sourceLayer).map(layer => layer.id))];
        ids.forEach(id => {
          registerLayerVisibility(id, initiallyVisible);
          group.layerIds.add(id);
        });
        controls.data[sourceLayer] = {
          set: setAll,
          theme: on => setThemeVisibility(ids, on),
          el: layerElement
        };
        if (initiallyVisible) setAll(true);
        if (filterInView) {
          inViewGroups.push({
            sl: sourceLayer,
            source: classEntries[0].l.source,
            queryLayers: ids,
            gcb: groupInput,
            items,
            note,
            visibleCategories: new Set()
          });
        }
        group.body.appendChild(layerElement);
      });
    });
  }

  return { build };
}
