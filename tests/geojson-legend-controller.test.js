import assert from 'node:assert/strict';
import test from 'node:test';
import { createGeojsonLegendController } from '../js/geojson-legend-controller.js';

function makeElement(tagName) {
  const element = {
    tagName,
    children: [],
    attributes: {},
    classNames: new Set(),
    classList: {
      add(name) { element.classNames.add(name); },
      toggle(name, enabled) {
        if (enabled) element.classNames.add(name);
        else element.classNames.delete(name);
      }
    },
    appendChild(child) { this.children.push(child); return child; },
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    querySelector(selector) {
      return selector === 'input' && /<input\b/.test(this.innerHTML) ? this.input : null;
    },
    querySelectorAll(selector) {
      return selector === '.geojson-class-entry' ? this.children.filter(child =>
        child.classNames.has('geojson-class-entry')) : [];
    },
    setAttribute(name, value) { this.attributes[name] = value; }
  };
  Object.defineProperty(element, 'childElementCount', { get: () => element.children.length });
  return element;
}

function setup({ parsedCategories = null } = {}) {
  const elements = [];
  const appliedEntries = [];
  const createdIsolationButtons = [];
  const loaders = new Map();
  const controller = createGeojsonLegendController({
    document: {
      createElement: tagName => {
        const element = makeElement(tagName);
        if (tagName === 'label') element.input = { checked: true };
        elements.push(element);
        return element;
      }
    },
    loaders,
    geometryKinds: {
      Point: 'point',
      MultiPoint: 'point',
      LineString: 'line',
      MultiLineString: 'line',
      Polygon: 'polygon',
      MultiPolygon: 'polygon'
    },
    colorClasses: () => parsedCategories,
    escapeHtml: value => String(value).replaceAll('<', '&lt;'),
    sanitizeColor: value => typeof value === 'string' ? value.replace(/[<>;]/g, '') : '#d9480f',
    createCategoryIsolationStatus: () => ({ element: makeElement('status') }),
    createCategoryIsolationController: () => ({ clear() {} }),
    categoryIsolationButton: category => {
      const button = makeElement('button');
      button.category = category;
      createdIsolationButtons.push(button);
      return button;
    },
    applyEntry: (...args) => appliedEntries.push(args)
  });
  return { controller, loaders, elements, appliedEntries, createdIsolationButtons };
}

test('GeoJSON legend categories apply configured labels, percentile labels, and descending order', () => {
  const parsedCategories = [
    { text: 'low', color: '#111111', test: ['low'], field: 'CU' },
    { text: 'high', color: '#222222', test: ['high'], field: 'CU' }
  ];
  const { controller } = setup({ parsedCategories });
  const overlay = {
    id: 'waters',
    style: { fill: ['match', ['get', 'CU']] },
    legend: { entries: [{ label: 'Configured low', color: '#aaaaaa' }] }
  };
  const loader = {
    advancedStyle: false,
    classification: {
      method: 'tellus_percentile',
      percentileLabels: ['P10', 'P90'],
      legendDescending: true
    }
  };

  assert.deepEqual(controller.categories(overlay, loader), [
    { text: 'P90', color: '#222222', test: ['high'], field: 'CU' },
    { text: 'P10', color: '#aaaaaa', test: ['low'], field: 'CU' }
  ]);
});

test('GeoJSON legend falls back to configured or static style categories', () => {
  const { controller } = setup();
  assert.deepEqual(controller.categories({
    id: 'static',
    name: 'Static overlay',
    style: { color: '#123456' }
  }, {
    advancedStyle: false,
    legend: undefined
  }), [{ text: 'Static overlay', color: '#123456', test: null }]);

  assert.deepEqual(controller.categories({
    id: 'configured',
    legend: {
      entries: [
        { label: 'Visible', color: '#abcdef' },
        { label: 42, color: '#123456' }
      ]
    }
  }, { advancedStyle: false }), [
    { text: 'Visible', color: '#abcdef', test: null }
  ]);
});

test('GeoJSON legend renders class controls and registers in-view filtering state', () => {
  const parsedCategories = [
    { text: 'Copper < 2', color: '#123456', test: ['<', 2], field: 'CU', lo: -Infinity, hi: 2 }
  ];
  const { controller, loaders, appliedEntries, createdIsolationButtons } = setup({ parsedCategories });
  const container = makeElement('container');
  const row = makeElement('row');
  const rootCheckbox = { checked: true };
  const loader = {
    legendContainer: container,
    rootCheckbox,
    rowElement: row,
    originalFilters: { waters: null },
    geometryTypes: new Set(['Point']),
    advancedStyle: false,
    classification: null
  };
  const overlay = {
    id: 'waters',
    name: 'Waters',
    style: { color: '#123456' },
    geometryType: 'Point',
    filterlegend: true
  };
  loaders.set(overlay.id, loader);

  controller.render(overlay);

  assert.equal(container.hidden, false);
  assert.match(container.children[2].children[0].innerHTML, /Copper &lt; 2/);
  assert.equal(loader.classState.total, 1);
  assert.equal(loader.classInputs.length, 1);
  assert.equal(loader.classInputs[0].checked, true);
  assert.equal(createdIsolationButtons.length, 1);
  assert.equal(controller.inViewGroups.length, 1);
  assert.equal(controller.inViewGroups[0].source, 'waters');
  assert.equal(controller.inViewGroups[0].items[0].category.field, 'CU');

  loader.classInputs[0].checked = false;
  loader.classInputs[0].onchange();
  assert.equal(appliedEntries.length, 1);
  assert.equal(row.classNames.has('legend-off'), false);

  controller.render(overlay);
  assert.equal(controller.inViewGroups.length, 1);
});

test('GeoJSON swatches distinguish mixed geometry and sanitize configured color', () => {
  const { controller } = setup();
  const overlay = {
    id: 'mixed',
    geometryType: ['Polygon', 'Point'],
    opacity: 0.5,
    style: { color: '#12<456', fill: '#abcdef', width: 2 }
  };
  const loader = { advancedStyle: false };

  const swatch = controller.swatch(overlay, undefined, new Set(['Polygon', 'Point']));
  assert.match(swatch, /geojson-swatch-mixed/);
  assert.match(swatch, /class="geojson-polygon"[^>]*background:#abcdef/);
  assert.match(swatch, /class="geojson-point"[^>]*border:2px solid #12456/);
});
