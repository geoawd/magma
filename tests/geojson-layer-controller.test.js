import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createGeojsonLayerController,
  hasRenderableGeojsonGeometry
} from '../js/geojson-layer-controller.js';

test('recognizes usable nested and collection geometries', () => {
  assert.equal(hasRenderableGeojsonGeometry({
    type: 'MultiPolygon',
    coordinates: [[[[1, 2], [3, 4], [1, 2]]]]
  }), true);
  assert.equal(hasRenderableGeojsonGeometry({
    type: 'GeometryCollection',
    geometries: [{ type: 'Point', coordinates: [5, 6] }]
  }), true);
  assert.equal(hasRenderableGeojsonGeometry({
    type: 'GeometryCollection',
    geometries: [{ type: 'Point', coordinates: [NaN, 2] }]
  }), false);
  assert.equal(hasRenderableGeojsonGeometry(null), false);
});

test('creates fill, line, and point layers and registers initial visibility', () => {
  const sources = new Map();
  const layers = new Map();
  const registered = [];
  const loaders = new Map();
  const map = {
    addSource: (id, source) => sources.set(id, source),
    addLayer: (layer, beforeId) => layers.set(layer.id, { ...layer, beforeId }),
    getFilter: id => layers.get(id).filter
  };
  const controller = createGeojsonLayerController({
    map,
    loaders,
    registerLayerVisibility: (...args) => registered.push(args),
    isInitiallyInTheme: overlay => overlay.global === true
  });
  const overlay = {
    id: 'samples',
    global: true,
    attribution: 'Source',
    minzoom: 5,
    maxzoom: 12,
    opacity: 0.6,
    visible: true,
    style: { color: '#123456', fill: '#abcdef', width: 3, radius: 7, dasharray: [2, 1] }
  };

  controller.add(overlay, 'before-layer');

  assert.deepEqual(sources.get('samples'), {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
    attribution: 'Source'
  });
  assert.deepEqual(overlay.layerIds, ['samples-fill', 'samples', 'samples-points']);
  assert.equal(layers.get('samples-fill').paint['fill-color'], '#abcdef');
  assert.equal(layers.get('samples').paint['line-color'], '#123456');
  assert.deepEqual(layers.get('samples').paint['line-dasharray'], [2, 1]);
  assert.equal(layers.get('samples-points').paint['circle-radius'], 7);
  assert.ok([...layers.values()].every(layer => layer.beforeId === 'before-layer'));
  assert.deepEqual(registered, [
    ['samples-fill', true, true],
    ['samples', true, true],
    ['samples-points', true, true]
  ]);
  assert.deepEqual(loaders.get('samples').originalStyle, overlay.style);
  assert.equal(loaders.get('samples').status, 'idle');
});
