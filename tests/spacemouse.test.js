import assert from 'node:assert/strict';
import test from 'node:test';
import { createSpaceMouseController, decodeSpaceMouseReport } from '../js/spacemouse.js';

function report(values) {
  const buffer = new ArrayBuffer(values.length * 2);
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
    classes,
    classList: { toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name) },
    addEventListener: (name, callback) => listeners.set(name, callback),
    setAttribute: (name, value) => attributes.set(name, value)
  };
}

function mockSettings() {
  const inputs = new Map(Object.entries({
    spaceMousePanSpeed: ['number', '500'],
    spaceMouseZoomSpeed: ['number', '2'],
    spaceMouseRotationSpeed: ['number', '60'],
    spaceMouseReversePanX: ['checkbox', false],
    spaceMouseReversePanY: ['checkbox', false],
    spaceMouseReverseZoom: ['checkbox', false],
    spaceMouseReversePitch: ['checkbox', false],
    spaceMouseReverseRotation: ['checkbox', false]
  }).map(([id, [type, value]]) => [id, {
    type,
    value: type === 'checkbox' ? '' : value,
    checked: type === 'checkbox' ? value : false,
    listeners: new Map(),
    get valueAsNumber() { return Number(this.value); },
    addEventListener: (name, callback) => inputs.get(id).listeners.set(name, callback),
    focus() { this.focused = true; }
  }]));
  const elements = new Map(inputs);
  for (const id of ['spaceMouseSettingsDialog', 'spaceMouseSettingsForm', 'spaceMouseSettingsStatus',
    'spaceMouseCloseSettings', 'spaceMouseResetSettings']) {
    elements.set(id, {
      listeners: new Map(),
      addEventListener(name, callback) { this.listeners.set(name, callback); },
      showModal() { this.open = true; },
      close() { this.open = false; },
      textContent: ''
    });
  }
  return {
    inputs,
    elements,
    document: { getElementById: id => elements.get(id) },
    settingsButton: mockButton(),
    get dialog() { return elements.get('spaceMouseSettingsDialog'); },
    get status() { return elements.get('spaceMouseSettingsStatus'); },
    get resetButton() { return elements.get('spaceMouseResetSettings'); },
    get closeButton() { return elements.get('spaceMouseCloseSettings'); }
  };
}

test('SpaceMouse reports decode translation and rotation axes', () => {
  assert.deepEqual(decodeSpaceMouseReport(1, report([100, -200, 300])), {
    translation: [100, -200, 300]
  });
  assert.deepEqual(decodeSpaceMouseReport(2, report([-10, 20, -30])), {
    rotation: [-10, 20, -30]
  });
  assert.deepEqual(decodeSpaceMouseReport(1, report([100, -200, 300, -10, 20, -30])), {
    translation: [100, -200, 300],
    rotation: [-10, 20, -30]
  });
  assert.equal(decodeSpaceMouseReport(3, report([1, 2, 3])), null);
  assert.equal(decodeSpaceMouseReport(1, new DataView(new ArrayBuffer(4))), null);
});

test('SpaceMouse control stays hidden when WebHID is unavailable or disabled', () => {
  const unavailableButton = mockButton();
  assert.equal(createSpaceMouseController({
    button: unavailableButton,
    settingsButton: mockButton(),
    config: { enabled: true },
    hid: undefined
  }).enabled, false);
  assert.equal(unavailableButton.hidden, true);

  const disabledButton = mockButton();
  assert.equal(createSpaceMouseController({
    button: disabledButton,
    settingsButton: mockButton(),
    config: { enabled: false },
    hid: {}
  }).enabled, false);
  assert.equal(disabledButton.hidden, true);
});

test('SpaceMouse control can be restricted to advanced mode', () => {
  const hid = { addEventListener() {}, getDevices: async () => [] };
  const advancedSettings = mockSettings();
  const advancedButton = mockButton();
  createSpaceMouseController({
    button: advancedButton,
    settingsButton: advancedSettings.settingsButton,
    config: { enabled: true, advancedModeOnly: true },
    hid,
    window: { localStorage: { getItem: () => null, setItem() {}, removeItem() {} } },
    document: advancedSettings.document,
    notify() {}
  });
  assert.equal(advancedButton.classes.has('advanced-only'), true);
  assert.equal(advancedSettings.settingsButton.classes.has('advanced-only'), true);

  const defaultSettings = mockSettings();
  const defaultButton = mockButton();
  createSpaceMouseController({
    button: defaultButton,
    settingsButton: defaultSettings.settingsButton,
    config: { enabled: true, advancedModeOnly: false },
    hid,
    window: { localStorage: { getItem: () => null, setItem() {}, removeItem() {} } },
    document: defaultSettings.document,
    notify() {}
  });
  assert.equal(defaultButton.classes.has('advanced-only'), false);
  assert.equal(defaultSettings.settingsButton.classes.has('advanced-only'), false);
});

test('SpaceMouse preferences load, persist, and reset to configured defaults', () => {
  const settings = mockSettings();
  const values = new Map([['mapviewer.spacemouse.preferences.v1', JSON.stringify({
    panPixelsPerSecond: 800,
    reversePanX: true
  })]]);
  const storage = {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };
  const hid = { addEventListener() {}, getDevices: async () => [] };
  createSpaceMouseController({
    button: mockButton(),
    settingsButton: settings.settingsButton,
    config: { enabled: true, panPixelsPerSecond: 400, reversePanY: true },
    hid,
    window: { localStorage: storage },
    document: settings.document,
    notify() {}
  });

  assert.equal(settings.inputs.get('spaceMousePanSpeed').value, '800');
  assert.equal(settings.inputs.get('spaceMouseReversePanX').checked, true);
  assert.equal(settings.inputs.get('spaceMouseReversePanY').checked, true);
  settings.inputs.get('spaceMousePanSpeed').value = '900';
  settings.inputs.get('spaceMousePanSpeed').listeners.get('change')();
  assert.equal(JSON.parse(values.get('mapviewer.spacemouse.preferences.v1')).panPixelsPerSecond, 900);
  assert.equal(settings.status.textContent, 'Preferences saved in this browser.');

  settings.resetButton.listeners.get('click')();
  assert.equal(settings.inputs.get('spaceMousePanSpeed').value, '400');
  assert.equal(settings.inputs.get('spaceMouseReversePanX').checked, false);
  assert.equal(settings.inputs.get('spaceMouseReversePanY').checked, true);
  assert.equal(values.has('mapviewer.spacemouse.preferences.v1'), false);
  assert.equal(settings.status.textContent, 'Preferences reset to the configured defaults.');
});

test('SpaceMouse navigation pans, zooms, and rotates an active 3D map', async () => {
  const button = mockButton();
  const callbacks = new Map();
  let nextFrame = 0;
  const browserWindow = {
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    requestAnimationFrame: callback => {
      const id = ++nextFrame;
      callbacks.set(id, callback);
      return id;
    },
    cancelAnimationFrame: id => callbacks.delete(id)
  };
  const deviceListeners = new Map();
  const device = {
    vendorId: 0x046d,
    collections: [{ usagePage: 0x01, usage: 0x08 }],
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
      assert.deepEqual(options, { filters: [
        { vendorId: 0x256f },
        { vendorId: 0x046d, usagePage: 0x01, usage: 0x08 },
        { usagePage: 0x01, usage: 0x08 }
      ] });
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
  const settings = mockSettings();
  const controller = createSpaceMouseController({
    map,
    button,
    settingsButton: settings.settingsButton,
    hid,
    window: browserWindow,
    document: settings.document,
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

  deviceListeners.get('inputreport')({ reportId: 1, data: report([350, 350, 350, 0, 350, 350]) });
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
