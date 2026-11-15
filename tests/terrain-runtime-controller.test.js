import assert from 'node:assert/strict';
import test from 'node:test';
import { createTerrainRuntimeController } from '../js/terrain-runtime-controller.js';

function createController(overrides = {}) {
  const calls = [];
  const listeners = new Map();
  const modelA = { id: 'a', sourceId: 'terrain-a', cog: 'a.tif' };
  const modelB = { id: 'b', sourceId: 'terrain-b', cog: 'b.tif' };
  const state = {
    activeModel: modelA,
    contoursVisible: true,
    terrainOn: true,
    groupHidden: false,
    exaggeration: 1.5,
    protocolRegistered: true,
    checkbox: { checked: true },
    pitch: 60
  };
  const controller = createTerrainRuntimeController({
    map: {
      getLayer: id => id === 'dtm-contour-lines' || id === 'hillshade',
      getLayoutProperty: () => 'visible',
      removeLayer: id => calls.push(['removeLayer', id]),
      setTerrain: value => calls.push(['setTerrain', value]),
      easeTo: value => calls.push(['easeTo', value]),
      on: (event, callback) => listeners.set(event, callback),
      getPitch: () => 0
    },
    terrainConfig: { pitch: state.pitch, hillshadeVisible: false },
    contourLineId: 'dtm-contour-lines',
    models: [modelA, modelB],
    verifyTerrainRangeSupport: async model => calls.push(['verify', model.id]),
    reportTerrainRangeError: (model, error) => calls.push(['rangeError', model.id, error.message]),
    ensureCogProtocol: async () => { state.protocolRegistered = true; calls.push(['loadCog']); },
    isCogProtocolRegistered: () => state.protocolRegistered,
    getActiveModel: () => state.activeModel,
    setActiveModel: model => { state.activeModel = model; },
    setContoursVisible: visible => { state.contoursVisible = visible; },
    removeTerrainContours: () => calls.push(['removeContours']),
    addTerrainModelSource: (model, kind) => calls.push(['addSource', model.id, kind]),
    addHillshadeLayer: (model, before, visible) => calls.push(['addHillshade', model.id, before, visible]),
    setupTerrainContours: (model, before) => calls.push(['setupContours', model.id, before]),
    getTerrainOn: () => state.terrainOn,
    setTerrainOn: on => { state.terrainOn = on; },
    getTerrainCheckbox: () => state.checkbox,
    getTerrainGroupHidden: () => state.groupHidden,
    getTerrainLayerBeforeId: () => 'first-vector-layer',
    getTerrainExaggeration: () => state.exaggeration,
    setModelPickerValue: id => calls.push(['picker', id]),
    setTerrainButtonState: on => calls.push(['button', on]),
    toast: message => calls.push(['toast', message]),
    ...overrides
  });
  return { controller, calls, listeners, modelA, modelB, state };
}

test('switching terrain models preserves hillshade, contours, and active 3D terrain', async () => {
  const { controller, calls, modelB, state } = createController();
  await controller.setTerrainModel('b');

  assert.equal(state.activeModel, modelB);
  assert.deepEqual(calls, [
    ['verify', 'b'],
    ['removeContours'],
    ['removeLayer', 'hillshade'],
    ['picker', 'b'],
    ['addSource', 'b', 'terrain'],
    ['setTerrain', { source: 'terrain-b', exaggeration: 1.5 }],
    ['addHillshade', 'b', 'first-vector-layer', true],
    ['setupContours', 'b', 'first-vector-layer']
  ]);
});

test('terrain model range failures restore the picker and keep the active model', async () => {
  const failure = new Error('range requests are unavailable');
  const { controller, calls, modelA, state } = createController({
    verifyTerrainRangeSupport: async () => { throw failure; }
  });
  await controller.setTerrainModel('b');

  assert.equal(state.activeModel, modelA);
  assert.deepEqual(calls, [
    ['rangeError', 'b', failure.message],
    ['picker', 'a']
  ]);
});

test('3D terrain lazily loads COG support and synchronizes map and controls', async () => {
  const { controller, calls, state } = createController({
    isCogProtocolRegistered: () => state.protocolRegistered
  });
  state.protocolRegistered = false;
  controller.setTerrain3D(true);
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(state.terrainOn, true);
  assert.equal(state.checkbox.checked, true);
  assert.deepEqual(calls, [
    ['loadCog'],
    ['button', true],
    ['addSource', 'a', 'terrain'],
    ['setTerrain', { source: 'terrain-a', exaggeration: 1.5 }],
    ['easeTo', { pitch: 60, duration: 900 }]
  ]);
});

test('map pitch and move events retain terrain auto-toggle behavior', () => {
  const { controller, listeners, calls, state } = createController();
  state.terrainOn = false;
  state.checkbox.checked = false;
  controller.attachMapListeners();
  listeners.get('pitchstart')({ originalEvent: {} });
  assert.equal(state.terrainOn, true);
  listeners.get('moveend')();

  assert.deepEqual(calls, [
    ['button', true],
    ['addSource', 'a', 'terrain'],
    ['setTerrain', { source: 'terrain-a', exaggeration: 1.5 }],
    ['button', false],
    ['setTerrain', null],
    ['easeTo', { pitch: 0, bearing: 0, duration: 600 }]
  ]);
});
