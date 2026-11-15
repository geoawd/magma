import assert from 'node:assert/strict';
import test from 'node:test';
import { createCogOverlayLayerController } from '../js/cog-overlay-layer-controller.js';

function setup({ startupSnapshot = {}, protocolReady = true, initiallyInTheme = false } = {}) {
  const sources = new Map();
  const layers = new Map();
  const visibility = new Map();
  const operations = { registered: [], added: [], synced: [], notifications: [], paint: [] };
  const map = {
    getSource: id => sources.get(id),
    getLayer: id => layers.get(id),
    addSource: (id, source) => { sources.set(id, source); },
    addLayer: (layer, beforeId) => { layers.set(layer.id, layer); operations.added.push([layer, beforeId]); },
    setPaintProperty: (...args) => operations.paint.push(args)
  };
  const controller = createCogOverlayLayerController({
    map,
    config: { cogStyleDefaults: { ramp: 'Viridis', mode: 'continuous' } },
    baseUrl: 'https://maps.example.test/viewer/',
    getStartupSnapshot: () => startupSnapshot,
    getContourSettings: overlay => ({
      option: overlay.contour_option === true,
      enabled: overlay.contour_option === true,
      preferenceSet: false,
      intervals: { minor: 5, major: 25 },
      colors: { minor: '#808384', major: '#30383b' }
    }),
    resamplingUrl: url => `resampled:${url}`,
    hillshadeDefaults: { strength: 0.2 },
    registerLayerVisibility: (id, selected, inTheme) => {
      operations.registered.push([id, selected, inTheme]);
      visibility.set(id, { selected, inTheme, groups: new Set() });
    },
    isInitiallyInTheme: () => initiallyInTheme,
    layerVisibility: visibility,
    isProtocolRegistered: () => protocolReady,
    ensureProtocol: async () => {},
    syncLayerVisibility: id => operations.synced.push(id),
    initializeVisibleControls: () => {},
    effectiveHillshadeStrength: state => state.hillshadeStrength * state.opacity,
    notify: message => operations.notifications.push(message)
  });
  return { controller, map, sources, layers, visibility, operations };
}

test('COG overlay setup restores state and adds a visible overlay after its source is ready', () => {
  const startupSnapshot = {
    cogs: {
      elevation: {
        ramp: '',
        mode: 'continuous',
        opacity: 0.75,
        hillshadePreferenceSet: true,
        hillshadeEnabled: false,
        hillshadeStrength: 0.6,
        hillshadeVerticalScale: 3
      }
    },
    overlays: { elevation: true }
  };
  const { controller, sources, layers, operations } = setup({ startupSnapshot, initiallyInTheme: true });
  const overlay = {
    id: 'elevation',
    cog: 'https://data.example.test/elevation.tif?token=sample#unused',
    visible: false,
    opacity: 0.4,
    attribution: 'Survey',
    tileSize: 512,
    minzoom: 2,
    maxzoom: 16,
    hillshade_option: true,
    contour_option: true,
    legendunits: 'm'
  };

  controller.addCogLayer(overlay, 'labels');

  assert.equal(overlay.visible, true);
  assert.equal(overlay.opacity, 0.75);
  assert.equal(overlay.cogState.url, 'https://data.example.test/elevation.tif?token=sample');
  assert.equal(overlay.cogState.ramp, '');
  assert.equal(overlay.cogState.mode, 'continuous');
  assert.equal(overlay.cogState.hillshadeEnabled, false);
  assert.equal(overlay.cogState.hillshadeStrength, 0.6);
  assert.equal(overlay.cogState.restoredHillshadeVerticalScale, 3);
  assert.deepEqual(overlay.layerIds, [
    'elevation', 'elevation__hillshade', 'elevation__contour_lines', 'elevation__contour_labels'
  ]);
  assert.deepEqual(operations.registered, [['elevation', true, true]]);
  assert.equal(sources.get('elevation').url,
    'resampled:cog://https://data.example.test/elevation.tif?token=sample#unused');
  assert.equal(sources.get('elevation').attribution, 'Survey');
  assert.equal(layers.get('elevation').paint['raster-opacity'], 0.75);
  assert.deepEqual(operations.synced, ['elevation']);
});

test('COG basemaps are added immediately and use configured style defaults', () => {
  const { controller, sources, layers, operations } = setup();
  const overlay = {
    id: 'basemap-dem',
    cog: 'data/dem.tif',
    visible: true,
    opacity: 0.5,
    tileSize: 256
  };

  controller.addCogLayer(overlay, 'roads', true);

  assert.equal(overlay.cogState.ramp, 'Viridis');
  assert.equal(overlay.cogState.mode, 'continuous');
  assert.ok(sources.has('basemap-dem'));
  assert.deepEqual(operations.registered, [['basemap-dem', true, true]]);
  assert.equal(layers.get('basemap-dem').minzoom, undefined);
  assert.equal(layers.get('basemap-dem').paint['raster-opacity'], 0.5);
  assert.equal(operations.added[0][1], 'roads');
});

test('COG overlay opacity updates its base, color, and hillshade layers', () => {
  const { controller, layers, operations } = setup();
  const overlay = {
    id: 'dem',
    cog: 'data/dem.tif',
    visible: true,
    hillshade_option: true
  };
  controller.addCogLayer(overlay, null, true);
  overlay.cogState.colorLayerIds = ['dem__color'];
  overlay.cogState.hillshadeStrength = 0.5;
  layers.set('dem', {});
  layers.set('dem__color', {});
  layers.set(overlay.cogState.hillshadeLayerId, {});

  controller.setOpacity(overlay, 0.4);
  assert.equal(overlay.cogState.opacity, 0.4);
  assert.deepEqual(operations.paint, [
    ['dem', 'raster-opacity', 0.4],
    ['dem__color', 'raster-opacity', 0.4],
    ['dem__hillshade', 'hillshade-exaggeration', 0.2]
  ]);
});
