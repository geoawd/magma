import assert from 'node:assert/strict';
import test from 'node:test';
import { createSpaceMouseController, decodeSpaceMouseReport } from '../js/spacemouse.js';

function report(values) {
  const buffer = new ArrayBuffer(6);
  const data = new DataView(buffer);
  values.forEach((value, index) => data.setInt16(index * 2, value, true));
  return data;
}

function mockButton() {
  const listeners = new Map();
  const attributes = new Map();
  const classes = new Set();
  return {
    hidden: false,
    disabled: false,
    title: '',
    listeners,
    attributes,
    classList: { toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name) },
    addEventListener: (name, callback) => listeners.set(name, callback),
    setAttribute: (name, value) => attributes.set(name, value)
  };
}

test('SpaceMouse reports decode translation and rotation axes', () => {
  assert.deepEqual(decodeSpaceMouseReport(1, report([100, -200, 300])), {
    translation: [100, -200, 300]
  });
  assert.deepEqual(decodeSpaceMouseReport(2, report([-10, 20, -30])), {
    rotation: [-10, 20, -30]
  });
  assert.equal(decodeSpaceMouseReport(3, report([1, 2, 3])), null);
  assert.equal(decodeSpaceMouseReport(1, new DataView(new ArrayBuffer(4))), null);
});

test('SpaceMouse control stays hidden when WebHID is unavailable or disabled', () => {
  const unavailableButton = mockButton();
  assert.equal(createSpaceMouseController({
    button: unavailableButton,
    config: { enabled: true },
    hid: undefined
  }).enabled, false);
  assert.equal(unavailableButton.hidden, true);

  const disabledButton = mockButton();
  assert.equal(createSpaceMouseController({
    button: disabledButton,
    config: { enabled: false },
    hid: {}
  }).enabled, false);
  assert.equal(disabledButton.hidden, true);
});

test('SpaceMouse navigation pans, zooms, and rotates an active 3D map', async () => {
  const button = mockButton();
  const callbacks = new Map();
  let nextFrame = 0;
  const browserWindow = {
    requestAnimationFrame: callback => {
      const id = ++nextFrame;
      callbacks.set(id, callback);
      return id;
    },
    cancelAnimationFrame: id => callbacks.delete(id)
  };
  const deviceListeners = new Map();
  const device = {
    vendorId: 0x256f,
    opened: false,
    async open() { this.opened = true; },
    async close() { this.opened = false; },
    addEventListener: (name, callback) => deviceListeners.set(name, callback),
    removeEventListener: name => deviceListeners.delete(name)
  };
  const hidListeners = new Map();
  const hid = {
    addEventListener: (name, callback) => hidListeners.set(name, callback),
    getDevices: async () => [],
    requestDevice: async options => {
      assert.deepEqual(options, { filters: [{ vendorId: 0x256f }] });
      return [device];
    }
  };
  const movements = [];
  const map = {
    zoom: 5,
    pitch: 60,
    bearing: 0,
    panBy: (...args) => movements.push(['pan', ...args]),
    getZoom() { return this.zoom; },
    getMinZoom: () => 0,
    getMaxZoom: () => 24,
    setZoom(value) { this.zoom = value; },
    getPitch() { return this.pitch; },
    getBearing() { return this.bearing; },
    jumpTo({ pitch, bearing }) {
      this.pitch = pitch;
      this.bearing = bearing;
    }
  };
  const messages = [];
  const controller = createSpaceMouseController({
    map,
    button,
    hid,
    window: browserWindow,
    config: {
      enabled: true,
      panPixelsPerSecond: 500,
      zoomLevelsPerSecond: 2,
      rotationDegreesPerSecond: 60
    },
    is3d: () => true,
    notify: message => messages.push(message)
  });

  assert.equal(controller.enabled, true);
  await button.listeners.get('click')();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(button.attributes.get('aria-pressed'), 'true');

  deviceListeners.get('inputreport')({ reportId: 1, data: report([350, 350, 350]) });
  deviceListeners.get('inputreport')({ reportId: 2, data: report([0, 350, 350]) });
  const frame = timestamp => {
    const pending = [...callbacks.values()];
    callbacks.clear();
    pending.forEach(callback => callback(timestamp));
  };
  frame(1000);
  frame(1016);

  assert.deepEqual(movements[0], ['pan', [8, -8], { duration: 0 }]);
  assert.ok(Math.abs(map.zoom - 5.032) < 0.00001);
  assert.ok(Math.abs(map.pitch - 59.04) < 0.00001);
  assert.ok(Math.abs(map.bearing - 0.96) < 0.00001);

  await controller.disconnect();
  assert.equal(button.attributes.get('aria-pressed'), 'false');
  assert.equal(device.opened, false);
  assert.deepEqual(messages, []);
});
