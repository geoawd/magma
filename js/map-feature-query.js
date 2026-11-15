export function createMapFeatureQueryController({
  map,
  getConfig,
  fetchImpl = globalThis.fetch,
  notify = () => {}
}) {
  if (!map || typeof getConfig !== 'function') {
    throw new TypeError('Map and configuration access are required.');
  }
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function.');
  if (typeof notify !== 'function') throw new TypeError('notify must be a function.');

  const linkIndexes = new Map();

  function dataLayers() {
    const config = getConfig();
    const geojson = (config.overlays || [])
      .filter(overlay => overlay.geojson)
      .flatMap(overlay => overlay.layerIds || [overlay.id])
      .filter(id => map.getLayer(id));
    const style = map.getStyle();
    if (!style?.layers || !style.sources) return geojson;
    if (config.queryLayers) return [...config.queryLayers, ...geojson];
    return [
      ...style.layers
        .filter(layer => layer.source && style.sources[layer.source]?.type === 'vector')
        .map(layer => layer.id),
      ...geojson
    ];
  }

  function queryData(geometry) {
    const layers = dataLayers();
    if (!layers.length) return [];
    const config = getConfig();
    const seen = new Set();
    return map.queryRenderedFeatures(geometry, { layers }).filter(feature => {
      const overlay = (config.overlays || []).find(item =>
        item.geojson && (item.layerIds || [item.id]).includes(feature.layer.id)
      );
      if (overlay) feature.sourceLayer = overlay.name || overlay.id;
      else if (feature.layer?.metadata?.['theme-layer']) {
        feature.sourceLayer = feature.layer.metadata['theme-layer'];
      }
      const key = `${feature.source}|${feature.sourceLayer || ''}|${feature.id ?? ''}|${JSON.stringify(feature.properties)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function around(point, radius = 5) {
    return [[point.x - radius, point.y - radius], [point.x + radius, point.y + radius]];
  }

  function wholeMap() {
    const canvas = map.getCanvas();
    return [[0, 0], [canvas.clientWidth, canvas.clientHeight]];
  }

  function arcgisClickEnvelope(point, tolerance = 5) {
    const coordinates = [
      map.unproject([point.x - tolerance, point.y - tolerance]),
      map.unproject([point.x + tolerance, point.y - tolerance]),
      map.unproject([point.x - tolerance, point.y + tolerance]),
      map.unproject([point.x + tolerance, point.y + tolerance])
    ];
    const longitudes = coordinates.map(coordinate => coordinate.lng);
    const latitudes = coordinates.map(coordinate => coordinate.lat);
    return {
      xmin: Math.min(...longitudes),
      ymin: Math.min(...latitudes),
      xmax: Math.max(...longitudes),
      ymax: Math.max(...latitudes)
    };
  }

  function arcgisBoxPolygon(first, second) {
    const left = Math.min(first.x, second.x);
    const right = Math.max(first.x, second.x);
    const top = Math.min(first.y, second.y);
    const bottom = Math.max(first.y, second.y);
    const corners = [
      [left, top], [right, top], [right, bottom], [left, bottom], [left, top]
    ].map(point => {
      const coordinate = map.unproject(point);
      return [coordinate.lng, coordinate.lat];
    });
    return { rings: [corners] };
  }

  function linkIndex(link, defaultField) {
    const field = link.field || defaultField;
    const key = `${link.file}|${link.dataKey || ''}|${field}`;
    if (!linkIndexes.has(key)) {
      linkIndexes.set(key, fetchImpl(link.file).then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      }).then(json => {
        const rows = link.dataKey ? json[link.dataKey] : Object.values(json).find(Array.isArray);
        const index = new Map();
        (Array.isArray(rows) ? rows : []).forEach(row => {
          if (row[field] == null) return;
          const value = String(row[field]);
          if (!index.has(value)) index.set(value, []);
          index.get(value).push(row);
        });
        return index;
      }).catch(error => {
        linkIndexes.delete(key);
        throw error;
      }));
    }
    return linkIndexes.get(key);
  }

  async function withLinked(features) {
    const layerOf = feature => feature.sourceLayer || feature.layer.id;
    const ordered = [];
    for (const layer of new Set(features.map(layerOf))) {
      const parents = features.filter(feature => layerOf(feature) === layer);
      ordered.push(...parents, ...await linkedFor(layer, parents));
    }
    return ordered;
  }

  async function linkedFor(layer, parents) {
    const output = [];
    const definition = (getConfig().dataLinks || {})[layer];
    if (definition) {
      for (const link of definition.links || []) {
        let index;
        try {
          index = await linkIndex(link, definition.field);
        } catch (error) {
          notify(`Could not load linked data ${link.label || link.file}: ${error.message}`);
          continue;
        }
        const seen = new Set();
        parents.forEach(parent => {
          const id = parent.properties?.[definition.field];
          if (id == null || seen.has(String(id))) return;
          seen.add(String(id));
          (index.get(String(id)) || []).forEach(row => output.push({
            sourceLayer: `${layer}: ${link.label || link.file}`,
            linked: true,
            parent,
            parentLayer: layer,
            geometry: parent.geometry,
            properties: row
          }));
        });
      }
    }
    return output;
  }

  return {
    queryData,
    around,
    wholeMap,
    arcgisClickEnvelope,
    arcgisBoxPolygon,
    withLinked
  };
}
