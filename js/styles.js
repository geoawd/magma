// Builds the map style from CONFIG.datasets (one .pmtiles + style.json each), then starts app.js.
(async () => {
  const C = window.CONFIG;
  const datasets = C.datasets && C.datasets.length ? C.datasets : null;
  window.DATASET_LAYERS = {};
  window.DATASET_SOURCES = {};
  if (datasets) {
    const styles = await Promise.all(datasets.map(d => fetch(d.style || C.styleUrl).then(r => {
      if (!r.ok) throw new Error(`${d.style || C.styleUrl}: ${r.status}`);
      return r.json();
    })));
    const multi = datasets.length > 1;
    const merged = { version: 8, sources: {}, layers: [], metadata: {} };
    const usedIds = new Set(), groups = new Map();
    const addGroup = group => {
      const current = groups.get(group.name);
      if (current) current.layers = [...new Set([...(current.layers || []), ...(group.layers || [])])];
      else groups.set(group.name, { ...group, layers: [...new Set(group.layers || [])] });
    };
    datasets.forEach((d, i) => {
      const s = styles[i], rename = {};
      ['glyphs', 'sprite', 'name'].forEach(k => { if (merged[k] === undefined && s[k] !== undefined) merged[k] = s[k]; });
      Object.entries(s.sources || {}).forEach(([name, src]) => {
        const id = multi ? `${d.id}__${name}` : name;
        rename[name] = id;
        (window.DATASET_SOURCES[d.id] ||= []).push(id);
        merged.sources[id] = src.type === 'vector' && d.pmtiles ? { ...src, url: 'pmtiles://' + d.pmtiles } : src;
      });
      const names = new Set();
      s.layers.forEach(l => {
        if (l.type === 'background' && i > 0) return;
        const id = usedIds.has(l.id) ? `${d.id}__${l.id}` : l.id;
        const layerKey = l['source-layer'] && (l.metadata?.['theme-layer'] || l['source-layer']);
        const layout = layerKey
          ? {
            ...(l.layout || {}),
            visibility: (C.layerDefaults || {})[layerKey] === true ? 'visible' : 'none'
          }
          : l.layout;
        usedIds.add(id);
        merged.layers.push({
          ...l,
          id,
          ...(layout ? { layout } : {}),
          ...(l.source ? { source: rename[l.source] || l.source } : {})
        });
        if (layerKey) names.add(layerKey);
      });
      window.DATASET_LAYERS[d.id] = [...names];
      const g = s.metadata && s.metadata['legend-groups'];
      if (g) g.forEach(addGroup);
      else if (multi) addGroup({ name: d.name || d.id, layers: [...names] });
    });
    if (groups.size) merged.metadata['legend-groups'] = [...groups.values()];
    window.MAP_STYLE = merged;
  }
  const script = document.createElement('script');
  script.type = 'module';
  script.src = 'js/app.js';
  document.body.appendChild(script);
})().catch(e => console.error('Could not load map styles:', e));
