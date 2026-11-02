const SPACE_MOUSE_VENDOR_ID = 0x256f;
const AXIS_RANGE = 350;
const DEADZONE = 8;

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

function configuredSpeed(config, key, fallback) {
  const value = config[key];
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`CONFIG.spaceMouse.${key} must be a positive number.`);
  }
  return value;
}

export function createSpaceMouseController({ map, button, hid, window, config, is3d, notify }) {
  if (!button) throw new Error('The SpaceMouse control button is missing.');
  if (config?.enabled !== true || !hid) {
    button.hidden = true;
    return { enabled: false };
  }

  const panSpeed = configuredSpeed(config, 'panPixelsPerSecond', 500);
  const zoomSpeed = configuredSpeed(config, 'zoomLevelsPerSecond', 2);
  const rotationSpeed = configuredSpeed(config, 'rotationDegreesPerSecond', 60);
  const axes = { translation: [0, 0, 0], rotation: [0, 0, 0] };
  let device = null;
  let animationFrame = null;
  let previousFrameTime = 0;

  button.hidden = false;

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

    const [x, y, z] = axes.translation;
    if (elapsed && (x || y)) map.panBy([x * panSpeed * elapsed, -y * panSpeed * elapsed], { duration: 0 });
    if (elapsed && z) map.setZoom(Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), map.getZoom() + z * zoomSpeed * elapsed)));

    if (elapsed && is3d()) {
      const pitch = Math.max(0, Math.min(80, map.getPitch() - axes.rotation[1] * rotationSpeed * elapsed));
      const bearing = map.getBearing() + axes.rotation[2] * rotationSpeed * elapsed;
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
