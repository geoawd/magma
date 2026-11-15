import assert from 'node:assert/strict';
import test from 'node:test';
import { createLegendInViewController } from '../js/legend-in-view-controller.js';

function makeGroup({ source = 'source', layer = 'visible', items, checked = true } = {}) {
  return {
    sl: 'group',
    source,
    queryLayers: [layer, 'hidden'],
    gcb: { checked },
    items,
    note: { textContent: '' },
    visibleCategories: new Set()
  };
}

function makeItem(category, checked = true) {
  const classes = new Set();
  return {
    category,
    cb: { checked },
    lab: {
      classList: {
        toggle(name, enabled) {
          if (enabled) classes.add(name);
          else classes.delete(name);
        }
      },
      classes
    }
  };
}

function setup(groups, features = [{ properties: { kind: 'A', value: 2 } }]) {
  const listeners = new Map();
  const queries = [];
  const map = {
    on: (event, callback) => listeners.set(event, callback),
    getStyle: () => ({}),
    getLayer: id => id !== 'hidden',
    getLayoutProperty: () => 'visible',
    isSourceLoaded: () => true,
    queryRenderedFeatures: options => {
      queries.push(options);
      return features;
    }
  };
  const controller = createLegendInViewController({
    map,
    getGroups: () => groups,
    getScaleState: () => ({ hidden: false })
  });
  return { controller, listeners, queries };
}

test('in-view filtering queries visible layers once per field and updates class notes', () => {
  const present = { labels: ['A'], field: 'kind' };
  const absent = { labels: ['B'], field: 'kind' };
  const firstItem = makeItem(present);
  const secondItem = makeItem(absent, false);
  const first = makeGroup({ items: [firstItem, secondItem] });
  const secondItemSameField = makeItem(present);
  const second = makeGroup({ source: 'other', items: [secondItemSameField] });
  const { controller, queries } = setup([first, second]);

  controller.update();

  assert.deepEqual(queries, [{ layers: ['visible'] }]);
  assert.equal(first.visibleCategories.has(present), true);
  assert.equal(first.visibleCategories.has(absent), false);
  assert.equal(firstItem.lab.classes.has('nv'), false);
  assert.equal(secondItem.lab.classes.has('nv'), true);
  assert.equal(first.note.textContent, 'Showing classes present in the current view.');
  assert.equal(second.note.textContent, 'Showing classes present in the current view.');
});

test('in-view numeric bins and other categories use numeric and unmatched values', () => {
  const numeric = { field: 'value', lo: 1, hi: 3 };
  const other = { field: 'kind', other: true, all: new Set(['A']) };
  const numericItem = makeItem(numeric);
  const otherItem = makeItem(other);
  const group = makeGroup({ items: [numericItem, otherItem] });
  const { controller } = setup([group], [
    { properties: { kind: 'A', value: '2' } },
    { properties: { kind: 'B', value: '4' } }
  ]);

  controller.update();

  assert.equal(group.visibleCategories.has(numeric), true);
  assert.equal(group.visibleCategories.has(other), true);
  assert.equal(numericItem.lab.classes.has('nv'), false);
  assert.equal(otherItem.lab.classes.has('nv'), false);
});

test('hidden, unchecked, or off-scale groups are skipped and movement clears cached visibility', () => {
  const category = { labels: ['A'], field: 'kind' };
  const item = makeItem(category);
  const group = makeGroup({ items: [item] });
  group.visibleCategories.add(category);
  let scaleHidden = true;
  const listeners = new Map();
  const queries = [];
  const controller = createLegendInViewController({
    map: {
      on: (event, callback) => listeners.set(event, callback),
      getStyle: () => ({}),
      getLayer: () => true,
      getLayoutProperty: () => 'visible',
      isSourceLoaded: () => true,
      queryRenderedFeatures: options => {
        queries.push(options);
        return [{ properties: { kind: 'A' } }];
      }
    },
    getGroups: () => [group],
    getScaleState: () => ({ hidden: scaleHidden })
  });

  controller.attach();
  listeners.get('idle')();
  assert.equal(queries.length, 0);

  scaleHidden = false;
  listeners.get('movestart')();
  assert.equal(group.visibleCategories.size, 0);
  listeners.get('sourcedata')({ sourceId: 'unrelated' });
  assert.equal(queries.length, 0);
  listeners.get('sourcedata')({ sourceId: 'source' });
  assert.equal(queries.length, 1);
});
