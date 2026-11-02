const SPACE_MOUSE_VENDOR_ID = 0x256f;
const AXIS_RANGE = 350;
const DEADZONE = 8;
const PREFERENCE_FIELDS = {
  panPixelsPerSecond: { min: 1, max: 2000, input: 'spaceMousePanSpeed' },
  zoomLevelsPerSecond: { min: 0.1, max: 10, input: 'spaceMouseZoomSpeed' },
  rotationDegreesPerSecond: { min: 1, max: 180, input: 'spaceMouseRotationSpeed' },
  reversePanX: { input: 'spaceMouseReversePanX' },
  reversePanY: { input: 'spaceMouseReversePanY' },
  reverseZoom: { input: 'spaceMouseReverseZoom' },
  reversePitch: { input: 'spaceMouseReversePitch' },
  reverseRotation: { input: 'spaceMouseReverseRotation' }
};

export function decodeSpaceMouseReport(reportId, data) {
  if ((reportId !== 1 && reportId !== 2) || data.byteLength < 6) return null;
  const axes = [0, 1, 2].map(index => data.getInt16(index * 2, true));
  return reportId === 1 ? { translation: axes } : { rotation: axes };
}

function normalizeAxis(value) {
  const magnitude = Math.abs(value);
  if (magnitude <= DEADZONE) return 0;
  return Math.sign(value) * Math.min(1, (magnitude - DEADZONE) / (AXIS_RANGE - DEADZONE));
}

function defaultPreferences(config) {
  const preferences = {};
  Object.entries(PREFERENCE_FIELDS).forEach(([key, definition]) => {
    const value = config[key];
    if (definition.min !== undefined) {
      const speed = value ?? (key === 'panPixelsPerSecond' ? 500 : key === 'zoomLevelsPerSecond' ? 2 : 60);
      if (!Number.isFinite(speed) || speed < definition.min || speed > definition.max) {
        throw new Error(`CONFIG.spaceMouse.${key} must be between ${definition.min} and ${definition.max}.`);
      }
      preferences[key] = speed;
    } else {
      if (value !== undefined && typeof value !== 'boolean') {
        throw new Error(`CONFIG.spaceMouse.${key} must be a boolean.`);
      }
      preferences[key] = value ?? false;
    }
  });
  return preferences;
}

function preferenceStorageKey(window) {
  const profile = window.CONFIG_PROFILE === 'internal' ? '.internal' : '';
  return `mapviewer.spacemouse.preferences${profile}.v1`;
}

function readPreferences(window, key, defaults, notify) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return { ...defaults };
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) {
      throw new Error('Saved preferences must be an object.');
    }
    const preferences = { ...defaults };
    Object.keys(PREFERENCE_FIELDS).forEach(name => {
      if (!(name in saved)) return;
      const definition = PREFERENCE_FIELDS[name];
      const value = saved[name];
      if (definition.min !== undefined) {
        if (!Number.isFinite(value) || value < definition.min || value > definition.max) {
          throw new Error(`Saved ${name} is outside the supported range.`);
        }
      } else if (typeof value !== 'boolean') {
        throw new Error(`Saved ${name} must be a boolean.`);
      }
      preferences[name] = value;
    });
    return preferences;
  } catch (error) {
    console.error('Could not load SpaceMouse preferences:', error);
    notify('SpaceMouse preferences could not be loaded. Using the configured defaults.');
    return { ...defaults };
  }
}

export function createSpaceMouseController({
  map,
  button,
  settingsButton,
  hid,
  window,
  document,
  config,
  is3d,
  notify
}) {
  if (!button || !settingsButton) throw new Error('SpaceMouse controls are missing.');
  if (config?.enabled !== true || !hid) {
    button.hidden = true;
    settingsButton.hidden = true;
    return { enabled: false };
  }

  const defaults = defaultPreferences(config);
  const storageKey = preferenceStorageKey(window);
  const preferences = readPreferences(window, storageKey, defaults, notify);
  const settingsDialog = document.getElementById('spaceMouseSettingsDialog');
  const settingsForm = document.getElementById('spaceMouseSettingsForm');
  const settingsStatus = document.getElementById('spaceMouseSettingsStatus');
  const settingsInputs = Object.fromEntries(Object.entries(PREFERENCE_FIELDS).map(([key, definition]) => [
    key,
    document.getElementById(definition.input)
  ]));
  if (!settingsDialog || !settingsForm || !settingsStatus ||
      Object.values(settingsInputs).some(input => !input)) {
    throw new Error('SpaceMouse preference controls are missing.');
  }

  button.classList.toggle('advanced-only', config.advancedModeOnly === true);
  settingsButton.classList.toggle('advanced-only', config.advancedModeOnly === true);

  const axes = { translation: [0, 0, 0], rotation: [0, 0, 0] };
  let device = null;
  let animationFrame = null;
  let previousFrameTime = 0;

  function renderPreferences() {
    Object.entries(settingsInputs).forEach(([key, input]) => {
      if (input.type === 'checkbox') input.checked = preferences[key];
      else input.value = String(preferences[key]);
    });
  }

  function savePreferences() {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(preferences));
      settingsStatus.textContent = 'Preferences saved in this browser.';
    } catch (error) {
      console.error('Could not save SpaceMouse preferences:', error);
      settingsStatus.textContent = 'Preferences could not be saved in this browser.';
    }
  }

  function updatePreferences() {
    const updated = { ...preferences };
    for (const [key, input] of Object.entries(settingsInputs)) {
      const definition = PREFERENCE_FIELDS[key];
      if (input.type === 'checkbox') {
        updated[key] = input.checked;
        continue;
      }
      const value = input.valueAsNumber;
      if (!Number.isFinite(value) || value < definition.min || value > definition.max) {
        settingsStatus.textContent = `Enter a value from ${definition.min} to ${definition.max}.`;
        input.value = String(preferences[key]);
        input.focus();
        return;
      }
      updated[key] = value;
    }
    Object.assign(preferences, updated);
    savePreferences();
  }

  renderPreferences();
  Object.values(settingsInputs).forEach(input => input.addEventListener('change', updatePreferences));
  settingsForm.addEventListener('submit', event => event.preventDefault());
  settingsButton.addEventListener('click', () => {
    settingsStatus.textContent = '';
    settingsDialog.showModal();
  });
  document.getElementById('spaceMouseCloseSettings').addEventListener('click', () => settingsDialog.close());
  document.getElementById('spaceMouseResetSettings').addEventListener('click', () => {
    Object.assign(preferences, defaults);
    renderPreferences();
    try {
      window.localStorage.removeItem(storageKey);
      settingsStatus.textContent = 'Preferences reset to the configured defaults.';
    } catch (error) {
      console.error('Could not reset SpaceMouse preferences:', error);
      settingsStatus.textContent = 'Preferences could not be reset in this browser.';
    }
  });

  button.hidden = false;
  settingsButton.hidden = false;

  function setButtonState(connected) {
    button.disabled = false;
    button.classList.toggle('active', connected);
    button.setAttribute('aria-pressed', String(connected));
    const label = connected ? 'Disconnect 3Dconnexion SpaceMouse' : 'Connect 3Dconnexion SpaceMouse';
    button.title = label;
    button.setAttribute('aria-label', label);
  }

  function resetAxes() {
    axes.translation.fill(0);
    axes.rotation.fill(0);
    if (animationFrame !== null) {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
    previousFrameTime = 0;
  }

  function hasInput() {
    return axes.translation.some(value => value !== 0) || axes.rotation.some(value => value !== 0);
  }

  function updateMap(timestamp) {
    animationFrame = null;
    if (!device) return resetAxes();
    const elapsed = previousFrameTime ? Math.min((timestamp - previousFrameTime) / 1000, 0.05) : 0;
    previousFrameTime = timestamp;

    const [rawX, rawY, rawZ] = axes.translation;
    const x = rawX * (preferences.reversePanX ? -1 : 1);
    const y = rawY * (preferences.reversePanY ? -1 : 1);
    const z = rawZ * (preferences.reverseZoom ? -1 : 1);
    if (elapsed && (x || y)) map.panBy([x * preferences.panPixelsPerSecond * elapsed, -y * preferences.panPixelsPerSecond * elapsed], { duration: 0 });
    if (elapsed && z) map.setZoom(Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), map.getZoom() + z * preferences.zoomLevelsPerSecond * elapsed)));

    if (elapsed && is3d()) {
      const pitchDirection = preferences.reversePitch ? 1 : -1;
      const rotationDirection = preferences.reverseRotation ? -1 : 1;
      const pitch = Math.max(0, Math.min(80, map.getPitch() + axes.rotation[1] * preferences.rotationDegreesPerSecond * elapsed * pitchDirection));
      const bearing = map.getBearing() + axes.rotation[2] * preferences.rotationDegreesPerSecond * elapsed * rotationDirection;
      if (axes.rotation[1] || axes.rotation[2]) map.jumpTo({ pitch, bearing });
    }

    if (hasInput()) animationFrame = window.requestAnimationFrame(updateMap);
    else previousFrameTime = 0;
  }

  function onInputReport(event) {
    const report = decodeSpaceMouseReport(event.reportId, event.data);
    if (!report) return;
    const target = report.translation ? axes.translation : axes.rotation;
    const values = report.translation || report.rotation;
    values.forEach((value, index) => { target[index] = normalizeAxis(value); });
    if (animationFrame === null) animationFrame = window.requestAnimationFrame(updateMap);
  }

  async function openDevice(candidate) {
    await candidate.open();
    device = candidate;
    resetAxes();
    candidate.addEventListener('inputreport', onInputReport);
    setButtonState(true);
  }

  async function connectFromButton() {
    button.disabled = true;
    try {
      const [candidate] = await hid.requestDevice({ filters: [{ vendorId: SPACE_MOUSE_VENDOR_ID }] });
      if (!candidate) {
        notify('No SpaceMouse was selected.');
        return;
      }
      if (candidate.vendorId !== SPACE_MOUSE_VENDOR_ID) {
        throw new Error('The selected device is not a supported 3Dconnexion SpaceMouse.');
      }
      await openDevice(candidate);
    } catch (error) {
      console.error('Could not connect to the SpaceMouse:', error);
      notify(`Could not connect to the SpaceMouse: ${error.message}`);
    } finally {
      button.disabled = false;
    }
  }

  async function disconnect() {
    const currentDevice = device;
    if (!currentDevice) return;
    device = null;
    resetAxes();
    currentDevice.removeEventListener('inputreport', onInputReport);
    setButtonState(false);
    try {
      if (currentDevice.opened) await currentDevice.close();
    } catch (error) {
      console.error('Could not close the SpaceMouse connection:', error);
      notify(`Could not close the SpaceMouse connection: ${error.message}`);
    }
  }

  button.addEventListener('click', () => {
    if (device) void disconnect();
    else void connectFromButton();
  });
  hid.addEventListener('disconnect', event => {
    if (event.device !== device) return;
    device.removeEventListener('inputreport', onInputReport);
    device = null;
    resetAxes();
    setButtonState(false);
    notify('The SpaceMouse was disconnected.');
  });

  hid.getDevices().then(devices => {
    const authorizedDevice = devices.find(item => item.vendorId === SPACE_MOUSE_VENDOR_ID);
    if (authorizedDevice) return openDevice(authorizedDevice);
  }).catch(error => {
    console.error('Could not check for an authorized SpaceMouse:', error);
    notify(`Could not check for an authorized SpaceMouse: ${error.message}`);
  });

  return { enabled: true, disconnect };
}
