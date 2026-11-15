import assert from 'node:assert/strict';
import test from 'node:test';
import { createBoxSelectionController } from '../js/box-selection-controller.js';

function createController(overrides = {}) {
  const calls = [];
  const makeElement = () => ({
    id: '',
    style: {},
    classList: { toggle: (...args) => calls.push(['class', ...args]) },
    setAttribute: (...args) => calls.push(['attribute', ...args]),
    addEventListener: () => {},
    focus: () => {},
    appendChild: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0 })
  });
  const canvas = makeElement();
  const mapBox = makeElement();
  const document = {
    body: { classList: { toggle: (...args) => calls.push(['body-class', ...args]) } },
    createElement: makeElement,
    addEventListener: () => {},
    removeEventListener: () => {}
  };
  let boxMode = false, justBoxed = false;
  const controller = createBoxSelectionController({
    map: {
      getCanvasContainer: () => mapBox,
      getCanvas: () => canvas,
      dragPan: { disable: () => {}, enable: () => {} },
      touchZoomRotate: { disable: () => {}, enable: () => {} }
    },
    document,
    boxButton: makeElement(),
    boxTip: { textContent: '' },
    isBoxMode: () => boxMode,
    setBoxMode: value => { boxMode = value; },
    setJustBoxed: value => { justBoxed = value; },
    isNotificationPicking: () => false,
    cancelNotificationPick: () => {},
    selectNotificationLocation: () => {},
    getActiveTool: () => null,
    isMobile: () => false,
    openTool: () => {},
    arcgisQueryController: { cancel: () => calls.push(['cancel']) },
    queryData: bounds => { calls.push(['vector', bounds]); return [{ id: 'vector' }]; },
    arcgisBoxPolygon: (first, second) => ({ first, second }),
    queryArcgisOverlays: async (...args) => { calls.push(['arcgis', ...args]); return [{ id: 'arcgis' }]; },
    showTable: (...args) => calls.push(['table', ...args]),
    toast: message => calls.push(['toast', message]),
    ...overrides
  });
  return { controller, calls, getBoxMode: () => boxMode, getJustBoxed: () => justBoxed };
}

test('box selection toggles map interaction state and combines vector and ArcGIS results', async () => {
  const { controller, calls, getBoxMode, getJustBoxed } = createController();
  controller.setBox(true);
  assert.equal(getBoxMode(), true);
  assert.ok(calls.some(call => call[0] === 'cancel'));

  await controller.runSelection({ x: 10, y: 30 }, { x: 50, y: 80 });

  assert.equal(getBoxMode(), false);
  assert.equal(getJustBoxed(), true);
  assert.deepEqual(calls.find(call => call[0] === 'vector'), ['vector', [[10, 30], [50, 80]]]);
  assert.deepEqual(calls.find(call => call[0] === 'arcgis'), [
    'arcgis',
    { first: { x: 10, y: 30 }, second: { x: 50, y: 80 } },
    'esriGeometryPolygon',
    true
  ]);
  assert.deepEqual(calls.find(call => call[0] === 'table'), [
    'table',
    [{ id: 'vector' }, { id: 'arcgis' }],
    '2 record(s) selected'
  ]);
});

test('small selections are ignored and ArcGIS query errors still show vector hits', async () => {
  let tables = 0;
  const failed = createController({
    queryArcgisOverlays: async () => { throw new Error('service unavailable'); },
    showTable: () => { tables++; }
  });
  await failed.controller.runSelection({ x: 0, y: 0 }, { x: 2, y: 2 });
  assert.equal(tables, 0);

  await failed.controller.runSelection({ x: 0, y: 0 }, { x: 10, y: 10 });
  assert.equal(tables, 1);
  assert.ok(failed.calls.some(call => call[0] === 'toast' && call[1].includes('service unavailable')));
});
