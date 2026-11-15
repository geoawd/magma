export function hasRenderableGeojsonGeometry(geometry) {
  if (!geometry || typeof geometry !== 'object') return false;
  if (geometry.type === 'GeometryCollection') {
    return Array.isArray(geometry.geometries) && geometry.geometries.some(hasRenderableGeojsonGeometry);
  }
  return hasGeojsonPositions(geometry.coordinates);
}

function hasGeojsonPositions(coordinates) {
  if (!Array.isArray(coordinates)) return false;
  if (coordinates.length >= 2 && Number.isFinite(coordinates[0]) && Number.isFinite(coordinates[1])) return true;
  return coordinates.some(hasGeojsonPositions);
}

export function createGeojsonLayerController({
  map,
  loaders,
  registerLayerVisibility,
  isInitiallyInTheme
}) {
  function add(overlay, beforeId) {
    const empty = { type: 'FeatureCollection', features: [] };
    map.addSource(overlay.id, {
      type: 'geojson',
      data: empty,
      ...(overlay.attribution ? { attribution: overlay.attribution } : {})
    });
    const style = overlay.style || {};
    const fillId = `${overlay.id}-fill`;
    map.addLayer({
      id: fillId,
      type: 'fill',
      source: overlay.id,
      filter: ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false],
      ...(Number.isFinite(overlay.minzoom) ? { minzoom: overlay.minzoom } : {}),
      ...(Number.isFinite(overlay.maxzoom) ? { maxzoom: overlay.maxzoom } : {}),
      layout: { visibility: 'none' },
      paint: { 'fill-color': style.fill || style.color || '#d9480f', 'fill-opacity': overlay.opacity ?? 1 }
    }, beforeId);
    map.addLayer({
      id: overlay.id,
      type: 'line',
      source: overlay.id,
      ...(Number.isFinite(overlay.minzoom) ? { minzoom: overlay.minzoom } : {}),
      ...(Number.isFinite(overlay.maxzoom) ? { maxzoom: overlay.maxzoom } : {}),
      layout: { visibility: 'none', 'line-join': 'round' },
      paint: {
        'line-color': style.color || '#d9480f',
        'line-width': style.width ?? 2,
        'line-opacity': overlay.opacity ?? 1,
        ...(style.dasharray ? { 'line-dasharray': style.dasharray } : {})
      }
    }, beforeId);
    const pointId = `${overlay.id}-points`;
    map.addLayer({
      id: pointId,
      type: 'circle',
      source: overlay.id,
      ...(Number.isFinite(overlay.minzoom) ? { minzoom: overlay.minzoom } : {}),
      ...(Number.isFinite(overlay.maxzoom) ? { maxzoom: overlay.maxzoom } : {}),
      filter: ['match', ['geometry-type'], ['Point', 'MultiPoint'], true, false],
      layout: { visibility: 'none' },
      paint: {
        'circle-radius': style.radius ?? 5,
        'circle-color': style.fill || style.color || '#d9480f',
        'circle-stroke-color': style.color || '#d9480f',
        'circle-stroke-width': style.width ?? 1,
        'circle-opacity': overlay.opacity ?? 1,
        'circle-stroke-opacity': overlay.opacity ?? 1
      }
    }, beforeId);

    overlay.layerIds = [fillId, overlay.id, pointId];
    loaders.set(overlay.id, {
      config: overlay,
      originalStyle: { ...(overlay.style || {}) },
      originalFilters: {
        [fillId]: map.getFilter(fillId),
        [overlay.id]: map.getFilter(overlay.id),
        [pointId]: map.getFilter(pointId)
      },
      status: 'idle',
      statusElement: null,
      legendContainer: null,
      classifyButton: null,
      rootCheckbox: null,
      classState: null,
      classInputs: [],
      advancedStyle: false,
      classification: null,
      geometryTypes: null,
      data: null,
      loadingPromise: null
    });
    const inTheme = isInitiallyInTheme(overlay);
    overlay.layerIds.forEach(id => registerLayerVisibility(id, overlay.visible === true, inTheme));
  }

  return { add };
}
