import assert from 'node:assert/strict';
import test from 'node:test';
import { createTerraDrawController } from '../js/terra-draw-controller.js';

function createMap() {
  const drawingContainer = {
    classes: new Set(),
    classList: { add(name) { drawingContainer.classes.add(name); } },
    closest: selector => selector === '.maplibregl-ctrl' ? drawingContainer : null
  };
  const locationControl = {
    closest: selector => selector === '.maplibregl-ctrl' ? locationControl : null,
    after(node) { this.afterNode = node; }
  };
  const mapContainer = {
    querySelector(selector) {
      if (selector === '.maplibregl-ctrl-geolocate') return locationControl;
      if (selector === '.advanced-drawing-tools' && drawingContainer.classes.has('advanced-drawing-tools')) {
        return drawingContainer;
      }
      return null;
    }
  };
  const calls = [];
  return {
    calls,
    drawingContainer,
    locationControl,
    map: {
      addControl(control, position) {
        calls.push({ control, position });
        control.onAdd(this);
      },
      getContainer: () => mapContainer
    }
  };
}

test('Terra Draw loads once, adds its control, styles it, and places it after geolocation', async () => {
  let resolveScript;
  const stylesheetCalls = [];
  const scriptCalls = [];
  const { map, calls, drawingContainer, locationControl } = createMap();
  const window = {
    MaplibreTerradrawControl: {
      MaplibreTerradrawControl: class {
        constructor(options) { this.options = options; }
        onAdd() { return drawingContainer; }
      }
    }
  };
  const controller = createTerraDrawController({
    map,
    window,
    loadStylesheet: (...args) => { stylesheetCalls.push(args); return Promise.resolve(); },
    loadScript: (...args) => {
      scriptCalls.push(args);
      return new Promise(resolve => { resolveScript = resolve; });
    }
  });

  const first = controller.ensureLoaded();
  const second = controller.ensureLoaded();
  assert.strictEqual(first, second);
  assert.equal(stylesheetCalls.length, 1);
  assert.equal(scriptCalls.length, 1);
  resolveScript();

  const control = await first;
  assert.deepEqual(control.options, {
    modes: ['linestring', 'freehand', 'select', 'delete-selection', 'delete', 'download'],
    open: true
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].control, control);
  assert.equal(calls[0].position, 'top-right');
  assert.equal(drawingContainer.classes.has('advanced-drawing-tools'), true);
  assert.equal(locationControl.afterNode, drawingContainer);
});

test('Terra Draw can retry after the vendor control fails to initialize', async () => {
  let scriptLoads = 0;
  const { map, calls, drawingContainer } = createMap();
  const window = {};
  const controller = createTerraDrawController({
    map,
    window,
    loadStylesheet: () => Promise.resolve(),
    loadScript: () => { scriptLoads++; return Promise.resolve(); }
  });

  await assert.rejects(controller.ensureLoaded(), /drawing tools did not initialize/i);
  window.MaplibreTerradrawControl = {
    MaplibreTerradrawControl: class {
      onAdd() { return drawingContainer; }
    }
  };
  const control = await controller.ensureLoaded();

  assert.equal(scriptLoads, 2);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].control, control);
});
