import assert from 'node:assert/strict';
import test from 'node:test';
import { createOverlayRowControlsController } from '../js/overlay-row-controls.js';

function setup(overrides = {}) {
  const calls = [];
  const row = { children: [], appendChild(element) { this.children.push(element); } };
  const rowElement = {
    children: [],
    prepend(element) { this.children.unshift(element); },
    appendChild(element) { this.children.push(element); },
    insertAdjacentHTML(position, html) { calls.push(['insert', position, html]); }
  };
  const infoButton = { id: 'info-button' };
  const layerButton = { id: 'layer-button' };
  const infoPanel = { id: 'info-panel' };
  const layerPanel = { id: 'layer-panel' };
  const controller = createOverlayRowControlsController({
    layerTools: (...args) => {
      calls.push(['layerTools', ...args]);
      return { infoBtn: infoButton, btn: layerButton, infoPanel, panel: layerPanel };
    },
    infoFor: (...args) => {
      calls.push(['infoFor', ...args]);
      return 'layer information';
    },
    setOverlayTransparency: (...args) => calls.push(['transparency', ...args]),
    arcgisLegendRequest: () => false,
    collapser: (...args) => {
      calls.push(['collapser', ...args]);
      return { id: 'collapser' };
    },
    collapseLayers: true,
    overlayHasZoomableExtent: () => false,
    overlayBounds: async overlay => [overlay.id],
    zoomButton: (...args) => {
      calls.push(['zoomButton', ...args]);
      return { id: 'zoom-button' };
    },
    ...overrides
  });
  return { controller, calls, row, rowElement, infoButton, layerButton, infoPanel, layerPanel };
}

test('overlay row controls add legend expanders, zoom buttons, info buttons, and panels in order', async () => {
  const { controller, calls, row, rowElement, infoButton, layerButton, infoPanel, layerPanel } = setup({
    arcgisLegendRequest: () => true,
    overlayHasZoomableExtent: () => true
  });
  const overlay = { id: 'geojson', name: 'GeoJSON boundary', opacity: 0.6, maxzoom: 18 };

  const tools = controller.create({
    overlay,
    groupName: 'Boundaries',
    row,
    rowElement,
    controlsMarkup: '<section>download</section>'
  });

  assert.deepEqual(calls.slice(0, 3), [
    ['infoFor', 'geojson', 'Boundaries', undefined],
    ['layerTools', 40, 'layer information', calls[1][3], '<section>download</section>'],
    ['collapser', row, true]
  ]);
  assert.equal(rowElement.children[0].id, 'collapser');
  assert.equal(rowElement.children[1].id, 'zoom-button');
  assert.deepEqual(calls[3].slice(0, 2), ['zoomButton', 'GeoJSON boundary']);
  assert.deepEqual(await calls[3][2](), ['geojson']);
  assert.equal(calls[3][3], 18);

  controller.append({ row, rowElement, tools });

  assert.deepEqual(rowElement.children.map(element => element.id), [
    'collapser', 'zoom-button', 'info-button', 'layer-button'
  ]);
  assert.deepEqual(row.children.map(element => element.id), ['info-panel', 'layer-panel']);
});

test('overlay rows without a legend expander or extent insert the spacer and preserve tool markup', () => {
  const { controller, calls, row, rowElement } = setup({
    overlayHasZoomableExtent: () => false
  });
  const tools = controller.create({
    overlay: { id: 'raster', opacity: 1 },
    groupName: 'Rasters',
    row,
    rowElement,
    controlsMarkup: '<div>settings</div>'
  });

  assert.deepEqual(calls[1], [
    'layerTools', 0, 'layer information', calls[1][3], '<div>settings</div>'
  ]);
  assert.ok(calls.some(call => call[0] === 'insert' && call[1] === 'afterbegin' && call[2] === '<span class="cspace"></span>'));
  controller.append({ row, rowElement, tools });
  assert.deepEqual(rowElement.children.map(element => element.id), ['info-button', 'layer-button']);
});
