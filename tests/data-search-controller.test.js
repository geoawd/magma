import assert from 'node:assert/strict';
import test from 'node:test';
import { createDataSearchController } from '../js/data-search-controller.js';

function createElement(value = '') {
  const listeners = new Map();
  return {
    value,
    innerHTML: '',
    addEventListener: (name, handler) => listeners.set(name, handler),
    querySelector: () => ({ value: 'name' }),
    querySelectorAll: selector => selector === 'input:checked' ? [{ value: 'name' }] : [],
    focus() {},
    listeners
  };
}

function createController() {
  const results = [];
  const layerSelect = createElement('pmtiles:bedrock');
  const textInput = createElement('Needle');
  const fieldsElement = createElement();
  const map = { getStyle: () => ({ layers: [{ 'source-layer': 'bedrock' }] }) };
  const controller = createDataSearchController({
    map,
    layerSelect,
    textInput,
    fieldsElement,
    runButton: createElement(),
    getConfig: () => ({ overlays: [] }),
    geojsonLoaders: new Map(),
    getActiveThemeAll: () => false,
    getThemeOverlays: () => [],
    getThemeLayers: () => ['bedrock'],
    queryData: () => [
      { sourceLayer: 'bedrock', properties: { name: 'Needle in the bedrock' } },
      { sourceLayer: 'bedrock', properties: { name: 'Other value' } },
      { sourceLayer: 'superficial', properties: { name: 'Needle elsewhere' } }
    ],
    wholeMap: () => 'bounds',
    loadGeojsonData: async () => {},
    styleLayerKey: layer => layer['source-layer'],
    styleLayerLabel: (_style, layer) => layer,
    escapeHtml: value => value,
    toast: message => { throw new Error(message); },
    showTable: (...args) => results.push(args),
    setActiveTab: tab => results.push(['active-tab', tab]),
    isMobile: () => false,
    getActiveTool: () => 'search',
    openTool: () => {}
  });
  return { controller, fieldsElement, layerSelect, results };
}

test('populates searchable theme layers and presents matching PMTiles results', async () => {
  const { controller, fieldsElement, layerSelect, results } = createController();
  controller.populateSearchLayers();

  assert.match(layerSelect.innerHTML, /pmtiles:bedrock/);
  assert.match(fieldsElement.innerHTML, /name/);
  await controller.runSearch();
  assert.deepEqual(results, [
    ['active-tab', null],
    [
      [{ sourceLayer: 'bedrock', properties: { name: 'Needle in the bedrock' } }],
      '1 search result(s)'
    ]
  ]);
});
