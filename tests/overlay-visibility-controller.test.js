import assert from 'node:assert/strict';
import test from 'node:test';
import { createOverlayVisibilityController } from '../js/overlay-visibility-controller.js';

function setup(overrides = {}) {
  const calls = [];
  const defaults = {
    isCogProtocolRegistered: () => true,
    ensureCogProtocol: async () => calls.push(['ensureProtocol']),
    notify: message => calls.push(['notify', message]),
    setContoursVisible: visible => calls.push(['contours', visible]),
    addHillshadeLayer: (...args) => calls.push(['hillshade', ...args]),
    getActiveTerrainModel: () => ({ id: 'dem' }),
    getTerrainLayerBeforeId: () => 'first-layer',
    setClassFilters: (...args) => calls.push(['classFilters', ...args]),
    setLayerVisibility: (...args) => calls.push(['visibility', ...args]),
    syncCogLayerMode: overlay => calls.push(['syncCog', overlay.id]),
    ensurePendingCogLayer: overlay => calls.push(['pendingCog', overlay.id]),
    initializeVisibleCogControls: () => calls.push(['initializeCogControls']),
    getCursorPosition: () => ({ x: 4, y: 7 }),
    scheduleCogCursorValues: position => calls.push(['scheduleCursor', position]),
    getLayerVisibility: () => ({ inTheme: true }),
    ensureOverlaySymbology: overlay => calls.push(['symbology', overlay.id]),
    setThemeLayerVisibility: (...args) => calls.push(['themeVisibility', ...args]),
    ...overrides
  };
  return { controller: createOverlayVisibilityController(defaults), calls };
}

test('ordinary overlays and contours update checkbox, visibility, and contour state', () => {
  const { controller, calls } = setup();
  const checkbox = {};
  const row = { classList: { toggle: (...args) => calls.push(['class', ...args]) } };
  const setVisibility = controller.bind({
    overlay: { id: 'contour', contours: true },
    checkbox,
    row,
    layerIds: ['contour-line'],
    geojsonLoader: null
  });

  setVisibility(true);

  assert.equal(checkbox.checked, true);
  assert.deepEqual(calls, [
    ['class', 'legend-off', false],
    ['contours', true],
    ['visibility', ['contour-line'], true],
    ['symbology', 'contour']
  ]);
});

test('GeoJSON visibility clears isolation and updates category filters and checkboxes', () => {
  const { controller, calls } = setup();
  const categories = ['A', 'B'];
  const hidden = new Set(['A']);
  const inputs = [{ checked: false }, { checked: false }];
  let cleared = 0;
  const setVisibility = controller.bind({
    overlay: { id: 'geojson' },
    checkbox: {},
    row: { classList: { toggle() {} } },
    layerIds: ['geojson-fill', 'geojson'],
    geojsonLoader: {
      categoryIsolationController: { clear: () => { cleared++; } },
      classState: { categories, hidden },
      classInputs: inputs
    }
  });

  setVisibility(false);
  assert.equal(cleared, 1);
  assert.deepEqual([...hidden], categories);
  assert.deepEqual(inputs.map(input => input.checked), [false, false]);
  assert.deepEqual(calls.filter(([name]) => name === 'classFilters' || name === 'visibility'), [
    ['classFilters', ['geojson-fill', 'geojson'], { categories, hidden }],
    ['visibility', ['geojson-fill', 'geojson'], false]
  ]);

  setVisibility(true);
  assert.equal(hidden.size, 0);
  assert.deepEqual(inputs.map(input => input.checked), [true, true]);
});

test('COG visibility synchronizes mode, pending layers, controls, cursor values, and theme symbology', () => {
  const { controller, calls } = setup();
  const cogState = {};
  const overlay = { id: 'cog', cogState };
  const setVisibility = controller.bind({
    overlay,
    checkbox: {},
    row: { classList: { toggle() {} } },
    layerIds: ['cog'],
    geojsonLoader: null
  });

  setVisibility(true);

  assert.equal(cogState.visible, true);
  assert.deepEqual(calls, [
    ['syncCog', 'cog'],
    ['pendingCog', 'cog'],
    ['initializeCogControls'],
    ['scheduleCursor', { x: 4, y: 7 }],
    ['symbology', 'cog']
  ]);
});

test('hillshade waits for COG support before enabling and reports load failures', async () => {
  let registered = false;
  let rejectProtocol;
  const { controller, calls } = setup({
    isCogProtocolRegistered: () => registered,
    ensureCogProtocol: () => new Promise((resolve, reject) => {
      rejectProtocol = reject;
    })
  });
  const checkbox = {};
  const overlay = { id: 'hillshade', hillshade: true };
  const setVisibility = controller.bind({
    overlay,
    checkbox,
    row: { classList: { toggle: (...args) => calls.push(['class', ...args]) } },
    layerIds: ['hillshade'],
    geojsonLoader: null
  });

  setVisibility(true);
  assert.equal(checkbox.checked, undefined);
  rejectProtocol(new Error('protocol unavailable'));
  await Promise.resolve();
  await Promise.resolve();
  assert.ok(calls.some(([name, message]) => name === 'notify' && /protocol unavailable/.test(message)));

  registered = true;
  setVisibility(true);
  assert.equal(checkbox.checked, true);
  assert.ok(calls.some(([name]) => name === 'hillshade'));
});

test('theme visibility synchronizes COG controls and overlay symbology', () => {
  const { controller, calls } = setup();
  const overlay = { id: 'cog', cogState: {} };

  controller.setThemeVisibility(overlay, ['cog'], true);

  assert.deepEqual(calls, [
    ['themeVisibility', ['cog'], true],
    ['pendingCog', 'cog'],
    ['initializeCogControls'],
    ['symbology', 'cog']
  ]);
});
