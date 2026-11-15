import assert from 'node:assert/strict';
import test from 'node:test';
import { createOverlayLegendController } from '../js/overlay-legend-controller.js';

function createElement(tagName) {
  const element = {
    tagName,
    children: [],
    dataset: {},
    classNames: new Set(),
    classList: {
      toggle(name, enabled) {
        if (enabled) this.owner.classNames.add(name);
        else this.owner.classNames.delete(name);
      },
      owner: null
    },
    append(...children) { this.children.push(...children); },
    appendChild(child) { this.children.push(child); return child; },
    querySelector(selector) {
      if (selector === 'input' && /<input\b/.test(this.innerHTML)) {
        this.input ||= { checked: /<input\b[^>]*\bchecked\b/.test(this.innerHTML) };
        return this.input;
      }
      if (selector === '.grprow') {
        this.rowElement ||= createElement('grprow');
        return this.rowElement;
      }
      return null;
    },
    setAttribute(name, value) { this.attributes ||= {}; this.attributes[name] = value; }
  };
  element.classList.owner = element;
  return element;
}

function setup(overlays) {
  const groups = new Map();
  const operations = { terrainRows: [], visibility: [], arcgis: [], appended: [] };
  const controls = { ov: {} };
  const controller = createOverlayLegendController({
    getLegendElement: () => createElement('legend'),
    overlayLegendGroups: groups,
    allOverlays: () => overlays,
    addGroup: (parent, name) => {
      const group = { name, body: createElement('body'), layerIds: new Set() };
      operations.appended.push(parent);
      return group;
    },
    terrainLegendRowController: {
      createRow: (overlay, body) => operations.terrainRows.push([overlay, body])
    },
    document: { createElement },
    escapeHtml: value => value,
    geojsonLoaders: new Map(),
    updateGeojsonLoadStatus() {},
    renderGeojsonLegend() {},
    overlayVisibilityController: {
      bind: context => visible => operations.visibility.push([context.overlay.id, visible]),
      setThemeVisibility: (...args) => operations.visibility.push(args)
    },
    controls,
    overlayDownloadController: {
      cogDownloadControlsMarkup: () => '',
      geojsonDownloadControlsMarkup: () => '',
      bindCogDownloads() {},
      bindGeojsonDownloads() {}
    },
    overlayRowControlsController: {
      create: () => ({ rowElement: createElement('row'), panel: createElement('panel') }),
      append() {}
    },
    hillshadeControlsMarkup: () => '',
    contourControlsMarkup: () => '',
    colorRampIcon: '<svg></svg>',
    geojsonStyleController: { open() {} },
    bindHillshadeControls() {},
    bindContourControls() {},
    overlayLegendImages: new Map(),
    renderArcgisLegend: (...args) => operations.arcgis.push(args),
    ensureOverlaySymbology() {},
    onTerrainGroupVisibilityChange: visible => operations.terrainVisibility = visible
  });
  return { controller, groups, controls, operations };
}

test('overlay legend builds grouped rows and wires overlay visibility controls', () => {
  const overlay = { id: 'hydro', name: 'Hydro', group: 'Water', visible: false, layerIds: ['hydro-fill', 'hydro-line'] };
  const { controller, groups, controls, operations } = setup([overlay]);

  controller.build();

  const group = groups.get('Water');
  assert.ok(group);
  assert.deepEqual([...group.layerIds], ['hydro-fill', 'hydro-line']);
  assert.equal(controls.ov.hydro.el.dataset.orderKey, 'overlay:hydro');
  assert.equal(controls.ov.hydro.el.classNames.has('legend-off'), true);
  assert.deepEqual(operations.arcgis.map(([, item]) => item), [overlay]);
  controls.ov.hydro.set(true);
  assert.deepEqual(operations.visibility, [['hydro', true]]);
});

test('overlay legend delegates terrain rows and keeps terrain group visibility synchronized', () => {
  const terrain = { id: 'terrain', group: 'Terrain', terrain: true };
  const { controller, groups, operations } = setup([terrain]);

  controller.build();

  assert.deepEqual(operations.terrainRows.map(([overlay]) => overlay), [terrain]);
  groups.get('Terrain').onVisibilityChange(false);
  assert.equal(operations.terrainVisibility, false);
});
