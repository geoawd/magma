export function createLegendInViewController({ map, getGroups, getScaleState }) {
  function update() {
    const groups = getGroups();
    if (!groups.length || !map.getStyle()) return;
    const cache = new Map();
    const valuesFor = (layers, field) => {
      const key = `${layers.join('|')}|${field}`;
      if (cache.has(key)) return cache.get(key);
      const values = new Set();
      const numbers = [];
      map.queryRenderedFeatures({ layers }).forEach(feature => {
        const value = feature.properties?.[field];
        values.add(String(value ?? '__null__'));
        if (value != null && value !== '' && !isNaN(value)) numbers.push(Number(value));
      });
      const result = { values, numbers };
      cache.set(key, result);
      return result;
    };

    groups.forEach(group => {
      const layers = group.queryLayers.filter(id => map.getLayer(id) &&
        map.getLayoutProperty(id, 'visibility') !== 'none');
      if (!group.gcb?.checked || getScaleState(group.sl).hidden || !layers.length ||
          (!map.isSourceLoaded(group.source) && !map.queryRenderedFeatures({ layers }).length)) return;
      let anyVisible = false;
      group.items.forEach(({ lab, en, category, cb }) => {
        const item = en?.cls || category;
        const { values, numbers } = valuesFor(layers, item.field);
        const present = item.labels ? item.labels.some(label => values.has(String(label)))
          : item.other ? [...values].some(value => !item.all.has(value))
            : numbers.some(number => number >= item.lo && number < item.hi);
        if (present) group.visibleCategories.add(item);
        else if (cb?.checked) group.visibleCategories.delete(item);
        const show = group.visibleCategories.has(item);
        lab.classList.toggle('nv', !show);
        anyVisible ||= show;
      });
      group.note.textContent = anyVisible
        ? 'Showing classes present in the current view.'
        : 'No features from this layer in the current view.';
    });
  }

  function clearVisibleCategories() {
    getGroups().forEach(group => group.visibleCategories.clear());
  }

  function handleMoveEnd() {
    clearVisibleCategories();
    update();
  }

  function handleSourceData(event) {
    if (getGroups().some(group => group.source === event.sourceId)) update();
  }

  function attach() {
    map.on('idle', update);
    map.on('movestart', clearVisibleCategories);
    map.on('moveend', handleMoveEnd);
    map.on('sourcedata', handleSourceData);
  }

  return { update, clearVisibleCategories, attach };
}
