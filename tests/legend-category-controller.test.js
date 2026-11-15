import assert from 'node:assert/strict';
import test from 'node:test';
import { createLegendCategoryController } from '../js/legend-category-controller.js';

function setup() {
  const filters = [];
  const visibility = [];
  let scaleUpdates = 0;
  const controller = createLegendCategoryController({
    document: {
      createElement: tagName => ({
        tagName,
        attributes: {},
        children: [],
        classList: { add(name) { this[name] = true; } },
        append(...children) { this.children.push(...children); },
        setAttribute(name, value) { this.attributes[name] = value; }
      })
    },
    map: { setFilter: (...args) => filters.push(args) },
    setLayerVisibility: (...args) => visibility.push(args),
    updateScaleState: () => { scaleUpdates++; }
  });
  return { controller, filters, visibility, getScaleUpdates: () => scaleUpdates };
}

test('category filters preserve existing filters and remove class filters when restored', () => {
  const { controller, filters } = setup();
  const existingFilter = ['==', ['get', 'status'], 'active'];
  const state = {
    hidden: new Set([{ test: ['match', ['get', 'class'], ['A'], true, false] }]),
    orig: { layer: existingFilter }
  };

  controller.setClassFilters(['layer'], state);
  assert.deepEqual(filters[0], ['layer', [
    'all', existingFilter, ['!', ['match', ['get', 'class'], ['A'], true, false]]
  ]]);

  state.hidden.clear();
  controller.setClassFilters(['layer'], state);
  assert.deepEqual(filters[1], ['layer', existingFilter]);
});

test('applying a legend entry toggles category filters and hides the layer only when all classes are hidden', () => {
  const { controller, filters, visibility, getScaleUpdates } = setup();
  const category = { text: 'A', test: ['==', ['get', 'class'], 'A'] };
  const state = { hidden: new Set(), total: 1, orig: { layer: null } };
  const checkbox = { checked: true };
  let cleared = 0;

  controller.applyEntry({
    ids: ['layer'],
    cls: category,
    state,
    checkbox,
    isolationController: { clear: () => { cleared++; } }
  }, false);

  assert.equal(checkbox.checked, false);
  assert.equal(cleared, 1);
  assert.equal(state.hidden.has(category), true);
  assert.deepEqual(filters[0], ['layer', ['all', ['!', category.test]]]);
  assert.deepEqual(visibility[0], [['layer'], false]);
  assert.equal(getScaleUpdates(), 1);

  controller.applyEntry({ ids: ['layer'] }, true);
  assert.deepEqual(visibility[1], [['layer'], true]);
});

test('category isolation restores prior visibility and updates accessible controls', () => {
  const { controller, filters, visibility, getScaleUpdates } = setup();
  const status = controller.createIsolationStatus();
  const isolation = controller.createIsolationController(status);
  const first = { text: 'First', test: ['==', ['get', 'class'], 'first'] };
  const second = { text: 'Second', test: ['==', ['get', 'class'], 'second'] };
  const state = { hidden: new Set(), total: 2, orig: { layer: null } };
  const entries = [
    { category: first, checkbox: { checked: true }, button: { setAttribute(name, value) { this[name] = value; } } },
    { category: second, checkbox: { checked: true }, button: { setAttribute(name, value) { this[name] = value; } } }
  ];
  let changeCount = 0;

  isolation.isolate(first, state, entries, ['layer'], () => { changeCount++; });
  assert.deepEqual([...state.hidden], [second]);
  assert.equal(entries[0].checkbox.checked, true);
  assert.equal(entries[1].checkbox.checked, false);
  assert.equal(entries[0].button['aria-pressed'], 'true');
  assert.equal(status.message.textContent, 'Showing only: First');
  assert.equal(status.element.hidden, false);
  assert.deepEqual(visibility[0], [['layer'], true]);

  status.restore.onclick();
  assert.equal(state.hidden.size, 0);
  assert.equal(entries[0].checkbox.checked, true);
  assert.equal(entries[1].checkbox.checked, true);
  assert.equal(entries[0].button['aria-pressed'], 'false');
  assert.equal(status.message.textContent, '');
  assert.equal(status.element.hidden, true);
  assert.equal(changeCount, 2);
  assert.equal(filters.length, 2);
  assert.equal(getScaleUpdates(), 2);
});

test('isolation buttons prevent row clicks and activate the requested category', () => {
  const { controller } = setup();
  const category = { text: 'Sample' };
  let isolated;
  const button = controller.createIsolationButton(
    category,
    { isolate: (...args) => { isolated = args; } },
    { hidden: new Set() },
    [],
    ['layer'],
    () => {}
  );
  let prevented = false;
  let stopped = false;

  button.onclick({
    preventDefault: () => { prevented = true; },
    stopPropagation: () => { stopped = true; }
  });

  assert.equal(button.className, 'category-isolate');
  assert.equal(button.attributes['aria-label'], 'Show only Sample');
  assert.equal(prevented, true);
  assert.equal(stopped, true);
  assert.equal(isolated[0], category);
});
