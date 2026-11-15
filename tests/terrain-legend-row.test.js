import assert from 'node:assert/strict';
import test from 'node:test';
import { createTerrainLegendRowController } from '../js/terrain-legend-row.js';

function makeElement(selectors = {}) {
  return {
    dataset: {},
    classList: { add() {} },
    attributes: {},
    querySelector: selector => selectors[selector] || null,
    setAttribute(name, value) { this.attributes[name] = value; }
  };
}

test('terrain legend row binds model, zoom, visibility, settings, and exaggeration controls', async () => {
  const checkbox = { checked: true };
  const modelPicker = { value: '' };
  const panel = { hidden: true };
  const tools = makeElement();
  const slider = { value: '1.6' };
  const value = { textContent: '' };
  const zoomPlaceholder = { replaceWith(button) { this.replacement = button; } };
  const row = makeElement({
    input: checkbox,
    '.terrain-model': modelPicker,
    '.terrain-zoom': zoomPlaceholder,
    '.terrain-tools': tools,
    '.lpanel': panel,
    '.terrain-exaggeration': slider,
    '.tval': value
  });
  row.querySelector = selector => ({
    input: checkbox,
    '.terrain-model': modelPicker,
    '.terrain-zoom': zoomPlaceholder,
    '.terrain-tools': tools,
    '.lpanel': panel,
    '.terrain-exaggeration': slider,
    '.tval': value
  })[selector] || null;

  const models = [
    { id: 'dtm', name: 'DTM', cog: 'data/dtm.tif', sourceId: 'dtm-source', maxzoom: 14 },
    { id: 'dsm', name: 'DSM', cog: 'data/dsm.tif', sourceId: 'dsm-source', maxzoom: 15 }
  ];
  let activeModel = models[0];
  let exaggeration = 1;
  let terrainCheckbox;
  let terrainToggle;
  let selectedModel;
  let metadataUrl;
  const terrainCalls = [];
  const mapCalls = [];
  let zoomRequest;
  let zoomMax;
  const controller = createTerrainLegendRowController({
    document: { createElement: () => row },
    map: { setTerrain: options => mapCalls.push(options) },
    models,
    escapeHtml: value => value,
    slidersIcon: '<svg></svg>',
    zoomButton: (label, getBounds, getMaxZoom) => {
      zoomRequest = getBounds;
      zoomMax = getMaxZoom;
      return makeElement();
    },
    getActiveModel: () => activeModel,
    setTerrainModel: id => { selectedModel = id; },
    getExaggeration: () => exaggeration,
    setExaggeration: value => { exaggeration = value; },
    getTerrainGroupHidden: () => false,
    isTerrainOn: () => true,
    setTerrain3D: (...args) => terrainCalls.push(args),
    setTerrainCheckbox: checkboxElement => { terrainCheckbox = checkboxElement; },
    getBaseUrl: () => 'https://map.example.test/',
    getCogMetadata: async url => {
      metadataUrl = url;
      return { bbox: [-8, 53, -5, 56] };
    }
  });
  const body = { children: [], appendChild(element) { this.children.push(element); } };

  controller.createRow({ name: 'Terrain' }, body);

  assert.equal(row.dataset.nokey, '1');
  assert.match(row.innerHTML, /value="dtm">DTM/);
  assert.equal(body.children[0], row);
  assert.equal(terrainCheckbox, checkbox);
  assert.equal(modelPicker.value, 'dtm');
  assert.equal(exaggeration, 1.6);
  assert.equal(value.textContent, '1.6x');
  checkbox.onchange();
  assert.deepEqual(terrainCalls, [[true, false]]);

  modelPicker.value = 'dsm';
  modelPicker.onchange();
  assert.equal(selectedModel, 'dsm');
  const zoomButton = zoomPlaceholder.replacement;
  assert.equal(zoomButton.classList.add && zoomMax(), 14);
  assert.deepEqual(await zoomRequest(), [-8, 53, -5, 56]);
  assert.equal(metadataUrl, 'https://map.example.test/data/dtm.tif');

  tools.onclick();
  assert.equal(panel.hidden, false);
  assert.equal(tools.attributes['aria-expanded'], 'true');
  slider.value = '2.4';
  slider.oninput();
  assert.equal(exaggeration, 2.4);
  assert.equal(value.textContent, '2.4x');
  assert.deepEqual(mapCalls, [{ source: 'dtm-source', exaggeration: 2.4 }]);
});

test('terrain zoom rejects when no DEM is selected', async () => {
  const checkbox = {};
  const row = makeElement({
    input: checkbox,
    '.terrain-zoom': { replaceWith() {} },
    '.terrain-tools': makeElement(),
    '.lpanel': { hidden: true },
    '.terrain-exaggeration': { value: '1' },
    '.tval': { textContent: '' }
  });
  const controller = createTerrainLegendRowController({
    document: { createElement: () => row },
    map: { setTerrain() {} },
    models: [],
    escapeHtml: value => value,
    slidersIcon: '',
    zoomButton: (label, getBounds) => {
      row.zoomRequest = getBounds;
      return makeElement();
    },
    getActiveModel: () => null,
    setTerrainModel() {},
    getExaggeration: () => 1,
    setExaggeration() {},
    getTerrainGroupHidden: () => false,
    isTerrainOn: () => false,
    setTerrain3D() {},
    setTerrainCheckbox() {},
    getBaseUrl: () => 'https://map.example.test/',
    getCogMetadata: async () => ({ bbox: [] })
  });

  controller.createRow({ name: 'Terrain' }, { appendChild() {} });
  assert.throws(row.zoomRequest, /No DEM is selected/);
});
