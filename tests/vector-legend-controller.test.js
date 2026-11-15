import assert from 'node:assert/strict';
import test from 'node:test';
import { createLegendCategoryController } from '../js/legend-category-controller.js';
import { createVectorLegendController } from '../js/vector-legend-controller.js';

function createElement(tagName) {
  const element = {
    tagName,
    children: [],
    dataset: {},
    classNames: new Set(),
    classList: {
      add(name) { element.classNames.add(name); },
      toggle(name, enabled) {
        if (enabled) element.classNames.add(name);
        else element.classNames.delete(name);
      }
    },
    append(...children) { this.children.push(...children); },
    appendChild(child) { this.children.push(child); return child; },
    querySelector(selector) {
      if (selector !== 'input' || !/<input\b/.test(this.innerHTML)) return null;
      this.input ||= { checked: /<input\b[^>]*\bchecked\b/.test(this.innerHTML) };
      return this.input;
    },
    setAttribute(name, value) { this.attributes ||= {}; this.attributes[name] = value; }
  };
  return element;
}

test('vector legend groups style layers, folds dot layers, and wires class visibility controls', () => {
  const style = {
    metadata: { 'legend-groups': [{ name: 'Geology', layers: ['formation'] }] },
    layers: [
      {
        id: 'formation-fill',
        source: 'geology',
        'source-layer': 'formation',
        type: 'fill',
        filter: ['==', ['get', 'active'], true],
        paint: { 'fill-color': '#123456' }
      },
      {
        id: 'formation-center-dot',
        source: 'geology',
        'source-layer': 'formation',
        type: 'circle',
        paint: { 'circle-color': '#000000', 'circle-radius': 2 }
      }
    ]
  };
  const categories = [
    { text: 'Class A', color: '#111111', test: ['==', ['get', 'class'], 'A'], field: 'class' },
    { text: 'Class B', color: '#222222', test: ['==', ['get', 'class'], 'B'], field: 'class' }
  ];
  const operations = { groups: [], registered: [], visible: [], filters: [], theme: [], scale: 0 };
  const legend = createElement('legend');
  const window = {};
  const controls = { data: {} };
  const map = {
    getStyle: () => style,
    setFilter: (...args) => operations.filters.push(args)
  };
  const document = { createElement };
  const categoryController = createLegendCategoryController({
    document,
    map,
    setLayerVisibility: (...args) => operations.visible.push(args),
    updateScaleState: () => { operations.scale++; }
  });
  const addGroup = (parent, name) => {
    const body = createElement('body');
    const group = { name, body, layerIds: new Set() };
    operations.groups.push(group);
    parent.appendChild(body);
    return group;
  };
  const controller = createVectorLegendController({
    map,
    document,
    window,
    config: { layerDefaults: {}, collapseLayers: false },
    getLegendElement: () => legend,
    addGroup,
    styleLayerKey: layer => layer['source-layer'],
    colorClasses: layer => layer.id === 'formation-fill' ? categories : null,
    styleLayerLabel: () => 'Formation',
    layerTools: () => ({ btn: createElement('button'), panel: createElement('panel') }),
    infoFor: () => undefined,
    setTransparency() {},
    zoomButton: () => createElement('zoom'),
    vectorLayerBounds: () => [[-8, 53], [-5, 56]],
    collapser: () => createElement('collapse'),
    categoryController,
    swatch: () => '<span class="swatch"></span>',
    formatFilter: () => '',
    escapeHtml: value => value,
    registerLayerVisibility: (...args) => operations.registered.push(args),
    setLayerVisibility: (...args) => operations.visible.push(args),
    setThemeVisibility: (...args) => operations.theme.push(args),
    controls,
    inViewGroups: []
  });

  controller.build();

  assert.deepEqual(window.LEGEND_GROUP_LAYERS, { Geology: ['formation'] });
  assert.equal(operations.groups.length, 1);
  assert.deepEqual([...operations.groups[0].layerIds], ['formation-fill', 'formation-center-dot']);
  assert.deepEqual(operations.registered, [
    ['formation-fill', false],
    ['formation-center-dot', false]
  ]);
  assert.equal(operations.groups[0].body.children.length, 1);
  assert.equal(controls.data.formation.el.dataset.orderKey, 'layer:formation');
  assert.equal(controls.data.formation.el.classNames.has('legend-off'), true);

  const groupCheckbox = controls.data.formation.el.children[0].children[1].input;
  groupCheckbox.checked = true;
  groupCheckbox.onchange();
  assert.equal(controls.data.formation.el.classNames.has('legend-off'), false);
  assert.deepEqual(operations.visible.at(-1), [['formation-fill', 'formation-center-dot'], true]);
});
