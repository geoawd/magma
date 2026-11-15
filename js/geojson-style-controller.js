import { cogClassRampColors } from './cog-classes.js';
import { COG_RAMP_COLORS } from './cog-style.js';
import {
  equalIntervalBreaks,
  geojsonFieldStats,
  matchColorExpression,
  parseManualBreaks,
  quantileBreaks,
  stepColorExpression,
  tellusPercentileClassification
} from './geojson-classification.js';

export function applyGeojsonPaint(map, overlay) {
  const style = overlay.style || {};
  const color = style.color || '#d9480f';
  map.setPaintProperty(`${overlay.id}-fill`, 'fill-color', style.fill || color);
  map.setPaintProperty(overlay.id, 'line-color', color);
  map.setPaintProperty(`${overlay.id}-points`, 'circle-stroke-color', color);
  map.setPaintProperty(`${overlay.id}-points`, 'circle-color', style.fill || color);
}

export function createGeojsonStyleController({
  map,
  document,
  loaders,
  getFieldFromExpression,
  renderLegend,
  toast
}) {
  let activeDialog = null;
  const dialog = document.getElementById('geojsonStyleDialog');
  const form = document.getElementById('geojsonStyleForm');
  const fieldSelect = document.getElementById('geojsonStyleField');
  const methodSelect = document.getElementById('geojsonStyleMethod');
  const rampSelect = document.getElementById('geojsonStyleRamp');
  const rampButton = document.getElementById('geojsonStyleRampButton');
  const rampCurrent = document.getElementById('geojsonStyleRampCurrent');
  const rampOptions = document.getElementById('geojsonStyleRampOptions');
  const classCount = document.getElementById('geojsonClassCount');
  const manualBreaks = document.getElementById('geojsonManualBreaks');
  const status = document.getElementById('geojsonStyleStatus');
  const rampOptionButtons = Object.keys(COG_RAMP_COLORS).map(name => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'geojson-ramp-option';
    option.setAttribute('role', 'option');
    option.setAttribute('aria-label', name);
    option.title = name;
    const bar = document.createElement('span');
    bar.className = 'geojson-ramp-bar';
    bar.style.backgroundImage = `linear-gradient(to right, ${COG_RAMP_COLORS[name].join(', ')})`;
    option.appendChild(bar);
    rampOptions.appendChild(option);
    option.onclick = () => {
      rampSelect.value = name;
      updateRampPicker();
      closeRampPicker(true);
      updateDialogControls();
    };
    return option;
  });

  function updateRampPicker() {
    const name = rampSelect.value;
    const ramp = COG_RAMP_COLORS[name];
    rampCurrent.style.backgroundImage = ramp ? `linear-gradient(to right, ${ramp.join(', ')})` : '';
    rampButton.setAttribute('aria-label', `Color ramp: ${name}`);
    rampOptionButtons.forEach(option => {
      const selected = option.getAttribute('aria-label') === name;
      option.setAttribute('aria-selected', String(selected));
      option.tabIndex = selected ? 0 : -1;
    });
  }

  function closeRampPicker(restoreFocus = false) {
    rampOptions.hidden = true;
    rampButton.setAttribute('aria-expanded', 'false');
    if (restoreFocus) rampButton.focus();
  }

  function openRampPicker(focusSelected = false) {
    rampOptions.hidden = false;
    rampButton.setAttribute('aria-expanded', 'true');
    if (focusSelected) {
      (rampOptionButtons.find(option => option.getAttribute('aria-selected') === 'true') ||
        rampOptionButtons[0])?.focus();
    }
  }

  function numericField(field) {
    return field?.numeric && field.values.length > 0;
  }

  function updateDialogControls() {
    const state = activeDialog;
    if (!state) return;
    const field = state.fields.find(item => item.name === fieldSelect.value);
    const numeric = numericField(field);
    const uniqueAvailable = field?.uniqueValues.length > 0 && field.uniqueValues.length <= 20;
    [...methodSelect.options].forEach(option => {
      if (option.value === 'unique_values') option.disabled = !uniqueAvailable;
      else option.disabled = !numeric;
    });
    if (methodSelect.selectedOptions[0]?.disabled) {
      methodSelect.value = numeric ? 'quantile' : uniqueAvailable ? 'unique_values' : '';
    }
    const method = methodSelect.value;
    const numericAutomatic = method === 'quantile' || method === 'equal_interval';
    const manual = method === 'manual_breaks';
    document.getElementById('geojsonClassCountRow').hidden = !numericAutomatic;
    classCount.hidden = !numericAutomatic;
    classCount.disabled = !numericAutomatic;
    document.getElementById('geojsonManualBreaksRow').hidden = !manual;
    manualBreaks.hidden = !manual;
    document.getElementById('geojsonManualBreaksHint').hidden = !manual;
    document.getElementById('geojsonApplyStyle').disabled = !field || !method;
    if (!field) status.textContent = 'No usable feature attributes were found.';
    else if (!numeric && !uniqueAvailable) {
      status.textContent = 'Unique-values classification is unavailable: this field has more than 20 distinct values.';
    } else if (method === 'tellus_percentile') {
      status.textContent = 'Uses fixed breaks at the 1st, 2nd, 5th, 10th, 15th, 20th, 25th, 40th, 50th, 60th, 75th, 85th, 90th, 95th, 98th, and 99th percentiles.';
    } else if (field.uniqueValues.length > 20 && !numericAutomatic && !manual) {
      status.textContent = `This field has ${field.uniqueValues.length} distinct values; unique-values classification is limited to 20.`;
    } else {
      status.textContent = '';
    }
    updateRampPicker();
  }

  function open(overlay) {
    const loader = loaders.get(overlay.id);
    if (!loader || loader.status !== 'loaded' || !loader.data) {
      toast('Enable this layer to load its attributes before classifying.');
      return;
    }
    const fields = geojsonFieldStats(loader.data.features);
    activeDialog = { overlay, loader, fields };
    fieldSelect.replaceChildren();
    fields.forEach(field => {
      const option = document.createElement('option');
      option.value = field.name;
      option.textContent = `${field.name}${numericField(field) ? ' (numeric)' : ''}`;
      fieldSelect.appendChild(option);
    });
    const classification = loader.classification;
    const configuredField = getFieldFromExpression(loader.originalStyle.fill) ||
      getFieldFromExpression(loader.originalStyle.color);
    fieldSelect.value = classification?.field || configuredField || fields[0]?.name || '';
    methodSelect.value = classification?.method ||
      (numericField(fields.find(field => field.name === fieldSelect.value)) ? 'quantile' : 'unique_values');
    classCount.value = String(
      ['quantile', 'equal_interval'].includes(classification?.method) ? classification.classCount : 5
    );
    manualBreaks.value = (classification?.breaks || []).join(', ');
    rampSelect.value = classification?.ramp || 'Viridis';
    document.getElementById('geojsonStyleTitle').textContent = `Classify ${overlay.name || overlay.id} layer`;
    document.getElementById('geojsonStyleDescription').textContent =
      'Custom classification applies for this page session; the configured style remains the reset option.';
    status.textContent = '';
    updateDialogControls();
    dialog.showModal();
  }

  function applyClassification() {
    const state = activeDialog;
    if (!state) return;
    const { overlay, loader, fields } = state;
    const field = fields.find(item => item.name === fieldSelect.value);
    if (!field) throw new Error('Select a feature attribute to classify.');
    const method = methodSelect.value;
    const rampName = rampSelect.value;
    const ramp = COG_RAMP_COLORS[rampName];
    if (!ramp) throw new Error('Select a valid color ramp.');
    let expression, breaks = [], classCountValue, percentileLabels;
    if (method === 'unique_values') {
      if (field.uniqueValues.length > 20) throw new Error('Unique-values classification is limited to 20 values.');
      classCountValue = field.uniqueValues.length;
      const colors = cogClassRampColors(ramp, Array.from({ length: classCountValue }, (_, index) => ({ max: index })));
      expression = matchColorExpression(field.name, field.uniqueValues, colors);
    } else {
      if (!numericField(field)) throw new Error('The selected field does not contain only numeric values.');
      if (method === 'quantile' || method === 'equal_interval') {
        classCountValue = Number(classCount.value);
        if (!Number.isInteger(classCountValue) || classCountValue < 2 || classCountValue > 12) {
          throw new Error('Choose between 2 and 12 numeric classes.');
        }
        breaks = method === 'quantile'
          ? quantileBreaks(field.values, classCountValue)
          : equalIntervalBreaks(field.values, classCountValue);
      } else if (method === 'tellus_percentile') {
        const classification = tellusPercentileClassification(field.values);
        breaks = classification.breaks;
        percentileLabels = classification.labels;
        classCountValue = breaks.length + 1;
      } else if (method === 'manual_breaks') {
        breaks = parseManualBreaks(manualBreaks.value, field.min, field.max);
        classCountValue = breaks.length + 1;
      } else {
        throw new Error('Select a supported classification method.');
      }
      const colors = cogClassRampColors(ramp, Array.from({ length: breaks.length + 1 }, (_, index) => ({ max: index })));
      expression = stepColorExpression(field.name, breaks, colors);
    }
    overlay.style = { ...(overlay.style || {}), color: expression, fill: expression };
    loader.advancedStyle = true;
    const legendDescending = method === 'tellus_percentile' &&
      loader.classification?.method === 'tellus_percentile' &&
      loader.classification.legendDescending === true;
    loader.classification = {
      field: field.name,
      method,
      classCount: classCountValue,
      breaks,
      ramp: rampName,
      percentileLabels,
      legendDescending
    };
    applyGeojsonPaint(map, overlay);
    renderLegend(overlay);
  }

  function reset(overlay) {
    const loader = loaders.get(overlay.id);
    if (!loader) return;
    overlay.style = { ...loader.originalStyle };
    loader.advancedStyle = false;
    loader.classification = null;
    applyGeojsonPaint(map, overlay);
    renderLegend(overlay);
  }

  rampButton.addEventListener('click', () => {
    if (rampOptions.hidden) openRampPicker(true);
    else closeRampPicker();
  });
  rampButton.addEventListener('keydown', event => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      openRampPicker(true);
    }
  });
  rampOptions.addEventListener('keydown', event => {
    const index = rampOptionButtons.indexOf(document.activeElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      closeRampPicker(true);
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0
        : event.key === 'End' ? rampOptionButtons.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + rampOptionButtons.length) % rampOptionButtons.length;
      rampOptionButtons[next]?.focus();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      rampOptionButtons[index]?.click();
    }
  });
  fieldSelect.addEventListener('change', updateDialogControls);
  methodSelect.addEventListener('change', updateDialogControls);
  document.getElementById('geojsonCancelStyle').addEventListener('click', () => dialog.close());
  document.getElementById('geojsonResetStyle').addEventListener('click', () => {
    if (!activeDialog) return;
    reset(activeDialog.overlay);
    dialog.close();
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    try {
      applyClassification();
      dialog.close();
    } catch (error) {
      status.textContent = error.message;
    }
  });
  dialog.addEventListener('close', () => { activeDialog = null; });
  updateRampPicker();

  return { open, reset, applyPaint: overlay => applyGeojsonPaint(map, overlay) };
}
