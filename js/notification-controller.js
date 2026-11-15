export function validateNotificationConfig(config) {
  const notificationTypes = Array.isArray(config.notifications) ? config.notifications : [];
  const supportedTypes = new Set(['text', 'email', 'tel', 'number', 'date', 'select', 'textarea']);
  const ids = new Set();
  notificationTypes.forEach((notification, index) => {
    if (!notification || typeof notification.id !== 'string' || !notification.id ||
        typeof notification.label !== 'string' || !notification.label ||
        typeof notification.title !== 'string' || !notification.title ||
        !Array.isArray(notification.fields)) {
      throw new Error(`Invalid CONFIG.notifications entry at index ${index}.`);
    }
    if (ids.has(notification.id)) throw new Error(`Duplicate notification id "${notification.id}".`);
    ids.add(notification.id);
    const names = new Set();
    notification.fields.forEach((field, fieldIndex) => {
      if (!field || typeof field.name !== 'string' || !field.name ||
          typeof field.label !== 'string' || !field.label ||
          !supportedTypes.has(field.type) ||
          (field.type === 'select' && (!Array.isArray(field.options) || !field.options.length))) {
        throw new Error(`Invalid field ${fieldIndex} in notification "${notification.id}".`);
      }
      if (names.has(field.name)) throw new Error(`Duplicate field "${field.name}" in notification "${notification.id}".`);
      names.add(field.name);
    });
    if (notification.recipient !== undefined && typeof notification.recipient !== 'string') {
      throw new Error(`Invalid recipient for notification "${notification.id}".`);
    }
    if (notification.reminderText !== undefined && typeof notification.reminderText !== 'string') {
      throw new Error(`Invalid reminder text for notification "${notification.id}".`);
    }
  });
  return config;
}

export function createNotificationController({
  map,
  maplibregl,
  document,
  window,
  navigator,
  config,
  projectCoordinates,
  isBoxMode,
  setBoxMode,
  toast
}) {
  const dialog = document.getElementById('notificationDialog');
  const form = document.getElementById('notificationForm');
  const fields = document.getElementById('notificationFields');
  const preview = document.getElementById('notificationPreview');
  const status = document.getElementById('notificationStatus');
  const notificationTypes = Array.isArray(config.notifications) ? config.notifications : [];
  const buttons = new Map();
  let picking = null;
  let currentNotification = null;
  let location = null;
  let marker = null;
  let previewEdited = false;

  function gridReference(point) {
    const [easting, northing] = projectCoordinates(point);
    if (easting < 0 || easting >= 500000 || northing < 0 || northing >= 500000) {
      return { text: 'Outside Irish Grid', easting: null, northing: null };
    }
    const e = String(Math.floor(easting)).padStart(6, '0');
    const n = String(Math.floor(northing)).padStart(6, '0');
    return { text: `Irish Grid E ${e} N ${n}`, easting: e, northing: n };
  }

  function renderFields(notification) {
    fields.replaceChildren();
    notification.fields.forEach((field, index) => {
      const id = `notification-field-${index}`;
      const label = document.createElement('label');
      label.htmlFor = id;
      label.append(document.createTextNode(field.label));
      let input;
      if (field.type === 'textarea') {
        input = document.createElement('textarea');
        input.rows = Number.isInteger(field.rows) ? field.rows : 3;
      } else if (field.type === 'select') {
        input = document.createElement('select');
        field.options.forEach(option => {
          const value = typeof option === 'string' ? option : option.value;
          const text = typeof option === 'string' ? option : option.label;
          if (typeof value !== 'string' || typeof text !== 'string') {
            throw new Error(`Invalid option in notification field "${field.name}".`);
          }
          const optionElement = document.createElement('option');
          optionElement.value = value;
          optionElement.textContent = text;
          input.appendChild(optionElement);
        });
      } else {
        input = document.createElement('input');
        input.type = field.type;
        ['min', 'max', 'step', 'placeholder'].forEach(attribute => {
          if (field[attribute] !== undefined) input.setAttribute(attribute, String(field[attribute]));
        });
      }
      input.id = id;
      input.name = field.name;
      input.required = field.required === true;
      label.appendChild(input);
      fields.appendChild(label);
    });
  }

  function fieldValues(notification) {
    return notification.fields.map(field => {
      const control = form.elements.namedItem(field.name);
      const value = control?.value?.trim() || '-';
      return `${field.label}: ${value}`;
    });
  }

  function buildMessage() {
    if (!currentNotification || !location) return '';
    const grid = gridReference(location);
    const lat = location.lat.toFixed(6);
    const lng = location.lng.toFixed(6);
    const mapUrl = new URL(window.location.href);
    mapUrl.hash = `${map.getZoom().toFixed(2)}/${lat}/${lng}`;
    return [
      currentNotification.title,
      '',
      `Grid reference: ${grid.text}`,
      `WGS84 latitude/longitude: ${lat}, ${lng}`,
      ...fieldValues(currentNotification),
      `Map link: ${mapUrl.href}`
    ].join('\n');
  }

  function refreshPreview() {
    if (!previewEdited) preview.value = buildMessage();
  }

  function openDialog(notification) {
    currentNotification = notification;
    if (form.dataset.notificationId !== notification.id) {
      renderFields(notification);
      form.dataset.notificationId = notification.id;
      previewEdited = false;
    }
    const grid = gridReference(location);
    const coordinates = `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`;
    document.getElementById('notificationTitle').textContent = notification.title;
    document.getElementById('notificationLocation').textContent = `${grid.text} · WGS84 ${coordinates}`;
    document.getElementById('notificationReminder').textContent = notification.reminderText || '';
    status.textContent = '';
    refreshPreview();
    dialog.showModal();
  }

  function cancelPick() {
    if (!picking) return;
    buttons.get(picking.id)?.setAttribute('aria-pressed', 'false');
    picking = null;
    map.getCanvas().style.cursor = '';
  }

  function startPick(notification, button) {
    if (picking?.id === notification.id) {
      cancelPick();
      return;
    }
    cancelPick();
    if (isBoxMode()) setBoxMode(false);
    picking = notification;
    buttons.get(notification.id)?.setAttribute('aria-pressed', 'true');
    map.getCanvas().style.cursor = 'crosshair';
    toast(`Click the map to place: ${notification.title}, or focus the map and press Enter or Space to use its centre. Press Esc to cancel.`);
    button.blur();
    map.getCanvas().focus();
  }

  function selectLocation(lngLat) {
    const notification = picking;
    if (!notification) return;
    cancelPick();
    location = { lng: lngLat.lng, lat: lngLat.lat };
    currentNotification = notification;
    marker?.remove();
    marker = new maplibregl.Marker({ draggable: true, color: '#a4372b' })
      .setLngLat(lngLat)
      .addTo(map);
    marker.on('dragend', () => {
      const point = marker.getLngLat();
      location = { lng: point.lng, lat: point.lat };
      if (dialog.open) {
        const grid = gridReference(location);
        document.getElementById('notificationLocation').textContent =
          `${grid.text} · WGS84 ${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`;
        previewEdited = false;
        refreshPreview();
      }
    });
    marker.getElement().addEventListener('click', event => {
      event.stopPropagation();
      openDialog(notification);
    });
    openDialog(notification);
  }

  validateNotificationConfig(config);
  if (notificationTypes.length) map.addControl({
    onAdd() {
      const group = document.createElement('div');
      group.className = 'maplibregl-ctrl maplibregl-ctrl-group notification-control-group advanced-only';
      notificationTypes.forEach(notification => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = notification.label;
        button.title = `${notification.label} (Advanced mode)`;
        button.setAttribute('aria-label', notification.label);
        button.setAttribute('aria-pressed', 'false');
        button.onclick = () => startPick(notification, button);
        buttons.set(notification.id, button);
        group.appendChild(button);
      });
      return group;
    },
    onRemove() { buttons.clear(); }
  }, 'bottom-right');

  form.addEventListener('input', event => {
    if (event.target === preview) previewEdited = true;
    else previewEdited = false;
    refreshPreview();
  });
  form.addEventListener('submit', event => event.preventDefault());
  document.getElementById('notificationClose').onclick = () => dialog.close();
  dialog.addEventListener('close', () => { previewEdited = false; });
  document.getElementById('notificationEmail').onclick = () => {
    if (!form.reportValidity()) return;
    const grid = gridReference(location);
    const subject = `${currentNotification.title} - ${grid.text}`;
    const mailto = `mailto:${encodeURIComponent(currentNotification.recipient || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(preview.value)}`;
    if (mailto.length > 1900) {
      status.textContent = 'Message is too long for an email link. Use Copy text instead.';
      return;
    }
    window.location.href = mailto;
    status.textContent = 'If no email opened, use Copy text and paste the message into an email.';
  };
  document.getElementById('notificationCopy').onclick = async () => {
    if (!form.reportValidity()) return;
    try {
      await navigator.clipboard.writeText(preview.value);
      status.textContent = 'Copied. Paste the message into an email.';
    } catch {
      preview.focus();
      preview.select();
      status.textContent = 'Press Ctrl+C (or Cmd+C) to copy the selected text.';
    }
  };

  return {
    isPicking: () => !!picking,
    cancelPick,
    selectLocation
  };
}
