import assert from 'node:assert/strict';
import test from 'node:test';
import { createMapLayerVisibilityController } from '../js/map-layer-visibility.js';

function createController(overrides = {}) {
  const layers = new Set();
  const visibility = new Map();
  const callbacks = {
    load: [],
    scale: 0,
    arcgis: 0,
    cogControls: 0,
    scheduled: [],
    pending: []
  };
  const controller = createMapLayerVisibilityController({
    map: {
      getLayer: id => layers.has(id),
      setLayoutProperty: (id, property, value) => {
        assert.equal(property, 'visibility');
        visibility.set(id, value);
      }
    },
    state: new Map(),
    isGeojsonLoadingEnabled: () => true,
    loadGeojsonData: id => callbacks.load.push(id),
    updateScaleState: () => { callbacks.scale++; },
    updateArcgisLegendInView: () => { callbacks.arcgis++; },
    initializeVisibleCogControls: () => { callbacks.cogControls++; },
    getCursorPosition: () => ({ x: 1, y: 2 }),
    scheduleCogCursorValues: position => callbacks.scheduled.push(position),
    allOverlays: () => [{ id: 'cog', cogState: {} }],
    ensurePendingCogLayer: overlay => callbacks.pending.push(overlay.id),
    ...overrides
  });
  return { controller, layers, visibility, callbacks };
}

test('effective visibility combines selection, theme membership, and hidden groups', () => {
  const { controller, layers, visibility, callbacks } = createController();
  layers.add('layer');
  controller.registerLayerVisibility('layer', true);
  assert.equal(visibility.get('layer'), 'visible');
  assert.deepEqual(callbacks.load, ['layer']);

  controller.setGroupVisibility(['layer'], 'collapsed-group', false);
  assert.equal(visibility.get('layer'), 'none');
  controller.setGroupVisibility(['layer'], 'collapsed-group', true);
  assert.equal(visibility.get('layer'), 'visible');
  assert.deepEqual(callbacks.load, ['layer', 'layer']);
  assert.equal(callbacks.pending.length, 2);

  controller.setThemeVisibility(['layer'], false);
  assert.equal(visibility.get('layer'), 'none');
  controller.setThemeVisibility(['layer'], true);
  assert.equal(visibility.get('layer'), 'visible');
  assert.deepEqual(callbacks.load, ['layer', 'layer', 'layer']);
  assert.equal(callbacks.cogControls, 4);
  assert.equal(callbacks.scheduled.length, 2);
});

test('setting selected visibility creates missing state and refreshes scale and ArcGIS legend', () => {
  const { controller, layers, visibility, callbacks } = createController();
  layers.add('new-layer');
  controller.setVis(['new-layer'], true);

  assert.equal(visibility.get('new-layer'), 'visible');
  assert.equal(callbacks.scale, 1);
  assert.equal(callbacks.arcgis, 1);
  assert.deepEqual(callbacks.load, ['new-layer']);
});
