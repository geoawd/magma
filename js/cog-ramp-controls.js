import { cogClassRampColors } from './cog-classes.js';
import { COG_RAMP_COLORS, cogQuantileBounds, sampleCogValueRange } from './cog-style.js';

export function createCogRampControlsController({
  map,
  document,
  window,
  Option,
  quantileClassCount,
  hillshadeMaxVerticalScale,
  hillshadeSliderMax,
  hillshadeTargetRange,
  displayRange,
  legendValueLabel,
  legendClassLabel,
  percentileRange,
  hillshadeSliderValue,
  hillshadeScaleFromSlider,
  isOverlayVisible,
  updateColorLayers,
  syncLayerMode,
  createHillshade,
  effectiveHillshadeStrength,
  refreshHillshade,
  refreshContours,
  getCursorPosition,
  scheduleCursorValues,
  toast
}) {
  function renderLegend(overlay, legend) {
    const state = overlay.cogState;
    const range = displayRange(state);
    legend.replaceChildren();
    legend.hidden = !state.ramp;
    if (!state.ramp) return;
    const title = document.createElement('div');
    title.className = 'cog-ramp-legend-title';
    const units = document.createElement('span');
    units.textContent = state.legendUnits;
    const rampName = document.createElement('span');
    rampName.className = 'cog-ramp-legend-ramp-name';
    rampName.textContent = state.ramp;
    title.append(units, rampName);
    if (state.mode === 'classes') {
      const classList = document.createElement('div');
      classList.className = 'cog-ramp-class-legend';
      const colors = cogClassRampColors(COG_RAMP_COLORS[state.ramp], state.classes);
      for (let index = colors.length - 1; index >= 0; index--) {
        const row = document.createElement('div');
        row.className = 'cog-ramp-class-row';
        const swatch = document.createElement('span');
        swatch.className = 'cog-ramp-class-swatch';
        swatch.style.backgroundColor = colors[index];
        const label = document.createElement('span');
        const limit = index === 0
          ? `≤ ${legendValueLabel(state.classes[0].max)}`
          : index < state.classes.length
            ? `> ${legendValueLabel(state.classes[index - 1].max)} to ≤ ${legendValueLabel(state.classes[index].max)}`
            : `> ${legendValueLabel(state.classes[index - 1].max)}`;
        const classLabel = state.classes[index]?.label;
        label.textContent = classLabel ? `${legendClassLabel(classLabel)} (${limit})` : limit;
        row.append(swatch, label);
        classList.appendChild(row);
      }
      legend.append(title, classList);
      return;
    }
    const bar = document.createElement('div');
    bar.className = 'cog-ramp-legend-bar';
    bar.style.backgroundImage = `linear-gradient(to right, ${COG_RAMP_COLORS[state.ramp].join(', ')})`;
    const values = document.createElement('div');
    values.className = 'cog-ramp-legend-values';
    const min = document.createElement('span');
    min.textContent = legendValueLabel(range.min);
    const max = document.createElement('span');
    max.textContent = legendValueLabel(range.max);
    values.append(min, max);
    legend.append(title, bar, values);
  }

  function initialize(overlay, panel, legend) {
    const controls = panel.querySelector('.cog-ramp-advanced-controls');
    const status = controls.querySelector('.cog-ramp-status');
    const state = overlay.cogState;
    if (state.controlsInitialized || state.controlsInitializing || !isOverlayVisible(overlay)) return;
    const url = state.url;
    const setup = async () => {
      const metadata = await window.MaplibreCOGProtocol.getCogMetadata(url);
      state.bandCount = metadata.bitsPerSample?.length || 0;
      if (!isOverlayVisible(overlay)) {
        status.textContent = 'Enable this layer to load its COG controls.';
        return false;
      }
      if (metadata.bitsPerSample?.length !== 1) {
        state.valueReadoutAvailable = false;
        state.ramp = '';
        status.textContent = metadata.bitsPerSample?.length > 1
          ? 'Multiband COGs are displayed as RGB; color ramps and hillshade are available for single-band COGs only.'
          : 'Color ramps and hillshade are available for single-band COGs only.';
        syncLayerMode(overlay);
        return true;
      }
      state.valueReadoutAvailable = true;
      const range = await sampleCogValueRange(url, metadata, window.MaplibreCOGProtocol,
        () => isOverlayVisible(overlay));
      if (!range) {
        status.textContent = 'Enable this layer to load its COG controls.';
        return false;
      }
      state.rangeMin = range.min;
      state.rangeMax = range.max;
      state.hillshadeVerticalCenter = range.min + (range.max - range.min) / 2;
      state.hillshadeVerticalScale = Number.isFinite(state.restoredHillshadeVerticalScale)
        ? Math.max(1, Math.min(hillshadeMaxVerticalScale, state.restoredHillshadeVerticalScale))
        : Math.max(1, Math.min(hillshadeMaxVerticalScale,
          Math.round(hillshadeTargetRange / (range.max - range.min))));
      delete state.restoredHillshadeVerticalScale;
      state.quantileBounds = cogQuantileBounds(range.values, quantileClassCount);
      state.percentileRange = percentileRange(range.values);
      status.textContent = '';
      const rampLabel = document.createElement('div');
      rampLabel.className = 'cog-ramp-picker-row';
      const rampLabelText = document.createElement('span');
      rampLabelText.textContent = 'Color ramp';
      const picker = document.createElement('div');
      picker.className = 'cog-ramp-picker';
      const rampButton = document.createElement('button');
      rampButton.type = 'button';
      rampButton.className = 'cog-ramp-picker-button';
      rampButton.setAttribute('aria-haspopup', 'listbox');
      rampButton.setAttribute('aria-expanded', 'false');
      const currentPreview = document.createElement('span');
      currentPreview.className = 'cog-ramp-preview';
      rampButton.append(currentPreview);
      const options = document.createElement('div');
      options.className = 'cog-ramp-options';
      options.setAttribute('role', 'listbox');
      options.setAttribute('aria-label', 'Color ramps');
      const rampNames = ['', ...Object.keys(COG_RAMP_COLORS)];
      const optionButtons = rampNames.map(name => {
        const option = document.createElement('button');
        option.type = 'button';
        option.className = 'cog-ramp-option';
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', String(name === state.ramp));
        option.setAttribute('aria-label', name || 'None (grayscale)');
        const preview = document.createElement('span');
        preview.className = 'cog-ramp-preview';
        if (name) preview.style.backgroundImage = `linear-gradient(to right, ${COG_RAMP_COLORS[name].join(', ')})`;
        else preview.classList.add('cog-ramp-preview-none');
        option.append(preview);
        options.appendChild(option);
        option.onclick = () => {
          state.ramp = name;
          try {
            updateColorLayers(overlay);
            renderLegend(overlay, legend);
            error.textContent = '';
          } catch (cause) {
            const message = `Could not apply ${overlay.name || overlay.id} color ramp: ${cause.message}`;
            error.textContent = message;
            toast(message);
          }
          updateRampPicker();
          closeRampPicker();
        };
        return option;
      });
      picker.append(rampButton, options);
      rampLabel.append(rampLabelText, picker);

      const modeLabel = document.createElement('label');
      modeLabel.className = 'cog-ramp-mode-row';
      modeLabel.append('Style');
      const modeSelect = document.createElement('select');
      modeSelect.className = 'cog-ramp-mode-select';
      modeSelect.add(new Option('Continuous', 'continuous'));
      modeSelect.add(new Option(`Quantile (${quantileClassCount} stops, smooth)`, 'quantile'));
      modeSelect.add(new Option('Percentile clipped (2-98%)', 'percentile'));
      if (state.classes.length) {
        modeSelect.add(new Option(`Configured class breaks (${state.classes.length})`, 'classes'));
      }
      modeSelect.value = state.mode;
      modeLabel.appendChild(modeSelect);
      const error = document.createElement('div');
      error.className = 'cog-ramp-error';
      error.setAttribute('role', 'alert');
      controls.replaceChildren(rampLabel, modeLabel, status, error);
      let contourToggle, minorIntervalInput, majorIntervalInput, minorColorInput, majorColorInput;
      if (state.contourOption) {
        const contourControls = document.createElement('section');
        contourControls.className = 'cog-contour-controls';
        const contourLabel = document.createElement('label');
        contourLabel.className = 'trow cog-contour-toggle';
        contourToggle = document.createElement('input');
        contourToggle.type = 'checkbox';
        contourToggle.checked = state.contoursEnabled;
        contourLabel.append(contourToggle, 'Create contour lines');
        const intervals = document.createElement('div');
        intervals.className = 'cog-contour-intervals';
        const makeIntervalInput = (label, key) => {
          const field = document.createElement('label');
          field.append(label);
          const input = document.createElement('input');
          input.type = 'number';
          input.min = '0.000001';
          input.step = 'any';
          input.value = String(state.contourIntervals[key]);
          field.appendChild(input);
          intervals.appendChild(field);
          return input;
        };
        minorIntervalInput = makeIntervalInput('Minor interval', 'minor');
        majorIntervalInput = makeIntervalInput('Major interval', 'major');
        const colors = document.createElement('div');
        colors.className = 'hillshade-colors cog-contour-colors';
        const makeColorInput = (label, key) => {
          const field = document.createElement('label');
          field.append(label);
          const input = document.createElement('input');
          input.type = 'color';
          input.value = state.contourColors[key];
          field.appendChild(input);
          colors.appendChild(field);
          return input;
        };
        minorColorInput = makeColorInput('Minor color', 'minor');
        majorColorInput = makeColorInput('Major color', 'major');
        contourControls.append(contourLabel, intervals, colors);
        controls.appendChild(contourControls);
        state.contourToggle = contourToggle;
      }
      const setPreview = (preview, name) => {
        preview.classList.toggle('cog-ramp-preview-none', !name);
        preview.style.backgroundImage = name
          ? `linear-gradient(to right, ${COG_RAMP_COLORS[name].join(', ')})`
          : '';
      };
      function updateRampPicker() {
        setPreview(currentPreview, state.ramp);
        optionButtons.forEach((option, index) =>
          option.setAttribute('aria-selected', String(rampNames[index] === state.ramp)));
        rampButton.setAttribute('aria-label', `Color ramp: ${state.ramp || 'None (grayscale)'}`);
      }
      function closeRampPicker() {
        options.hidden = true;
        rampButton.setAttribute('aria-expanded', 'false');
      }
      function openRampPicker(focusFirst = false) {
        options.hidden = false;
        rampButton.setAttribute('aria-expanded', 'true');
        if (focusFirst) optionButtons[0].focus();
      }
      options.hidden = true;
      rampButton.onclick = () => options.hidden ? openRampPicker() : closeRampPicker();
      picker.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
          closeRampPicker();
          rampButton.focus();
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          if (options.hidden) {
            openRampPicker(true);
            return;
          }
          const currentIndex = optionButtons.indexOf(document.activeElement);
          const startIndex = currentIndex < 0 ? (event.key === 'ArrowDown' ? -1 : 0) : currentIndex;
          const offset = event.key === 'ArrowDown' ? 1 : -1;
          optionButtons[(startIndex + offset + optionButtons.length) % optionButtons.length].focus();
        }
      });
      document.addEventListener('click', event => {
        if (!picker.contains(event.target)) closeRampPicker();
      });

      let shadeToggle, strength, strengthValue, reliefScale;
      if (state.hillshadeOption) {
        const shadeLabel = document.createElement('label');
        shadeLabel.className = 'trow cog-hillshade-toggle';
        shadeToggle = document.createElement('input');
        shadeToggle.type = 'checkbox';
        shadeToggle.checked = state.hillshadeEnabled;
        shadeLabel.append(shadeToggle, 'Create a hillshade blend');
        controls.appendChild(shadeLabel);
        const shadeStrength = document.createElement('label');
        shadeStrength.className = 'trow cog-hillshade-strength';
        shadeStrength.append('Hillshade strength ');
        strength = document.createElement('input');
        strength.type = 'range';
        strength.min = '0';
        strength.max = '100';
        strength.value = String(Math.round(state.hillshadeStrength * 100));
        strengthValue = document.createElement('output');
        strengthValue.textContent = `${strength.value}%`;
        shadeStrength.append(strength, strengthValue);
        controls.appendChild(shadeStrength);
        const reliefScaleLabel = document.createElement('label');
        reliefScaleLabel.className = 'trow cog-hillshade-scale';
        reliefScaleLabel.append('Relief exaggeration ');
        reliefScale = document.createElement('input');
        reliefScale.type = 'range';
        reliefScale.min = '1';
        reliefScale.max = String(hillshadeSliderMax);
        reliefScale.value = String(hillshadeSliderValue(state.hillshadeVerticalScale));
        reliefScaleLabel.appendChild(reliefScale);
        controls.appendChild(reliefScaleLabel);
      }

      modeSelect.onchange = () => {
        const previousMode = state.mode;
        state.mode = modeSelect.value;
        try {
          if (state.mode === 'percentile' && !state.percentileRange) {
            throw new Error('Values do not vary between the 2nd and 98th percentiles.');
          }
          updateColorLayers(overlay);
          renderLegend(overlay, legend);
          error.textContent = '';
        } catch (cause) {
          state.mode = previousMode;
          modeSelect.value = previousMode;
          const message = `Could not apply ${overlay.name || overlay.id} color style: ${cause.message}`;
          error.textContent = message;
          toast(message);
        }
      };
      if (state.hillshadeOption) {
        shadeToggle.onchange = () => {
          state.hillshadePreferenceSet = true;
          state.hillshadeEnabled = shadeToggle.checked;
          try {
            if (shadeToggle.checked) createHillshade(overlay);
            syncLayerMode(overlay);
          } catch (cause) {
            state.hillshadeEnabled = false;
            shadeToggle.checked = false;
            const message = `Could not create a hillshade for ${overlay.name || overlay.id}: ${cause.message}`;
            status.textContent = message;
            toast(message);
          }
        };
        strength.oninput = () => {
          state.hillshadeStrength = Number(strength.value) / 100;
          strengthValue.textContent = `${strength.value}%`;
          if (map.getLayer(state.hillshadeLayerId)) {
            map.setPaintProperty(state.hillshadeLayerId, 'hillshade-exaggeration',
              effectiveHillshadeStrength(state));
          }
        };
        reliefScale.onchange = () => {
          state.hillshadeVerticalScale = hillshadeScaleFromSlider(Number(reliefScale.value));
          try {
            refreshHillshade(overlay);
            error.textContent = '';
          } catch (cause) {
            state.hillshadeEnabled = false;
            shadeToggle.checked = false;
            const message = `Could not adjust the hillshade for ${overlay.name || overlay.id}: ${cause.message}`;
            error.textContent = message;
            toast(message);
          }
        };
      }
      if (state.contourOption) {
        contourToggle.onchange = async () => {
          state.contourPreferenceSet = true;
          state.contoursEnabled = contourToggle.checked;
          error.textContent = '';
          await refreshContours(overlay);
        };
        const updateIntervals = async () => {
          const intervals = { minor: Number(minorIntervalInput.value), major: Number(majorIntervalInput.value) };
          if (!(Number.isFinite(intervals.minor) && intervals.minor > 0 &&
                Number.isFinite(intervals.major) && intervals.major > intervals.minor)) {
            error.textContent = 'Contour intervals must be positive, and the major interval must be larger than the minor interval.';
            minorIntervalInput.value = String(state.contourIntervals.minor);
            majorIntervalInput.value = String(state.contourIntervals.major);
            return;
          }
          state.contourIntervals = intervals;
          error.textContent = '';
          await refreshContours(overlay);
        };
        minorIntervalInput.onchange = updateIntervals;
        majorIntervalInput.onchange = updateIntervals;
        minorColorInput.oninput = () => {
          state.contourColors.minor = minorColorInput.value;
          if (map.getLayer(state.contourLayerIds[0])) {
            map.setPaintProperty(state.contourLayerIds[0], 'line-color',
              ['match', ['get', 'level'], 1, state.contourColors.major, state.contourColors.minor]);
          }
        };
        majorColorInput.oninput = () => {
          state.contourColors.major = majorColorInput.value;
          if (map.getLayer(state.contourLayerIds[0])) {
            map.setPaintProperty(state.contourLayerIds[0], 'line-color',
              ['match', ['get', 'level'], 1, state.contourColors.major, state.contourColors.minor]);
          }
          if (map.getLayer(state.contourLayerIds[1])) {
            map.setPaintProperty(state.contourLayerIds[1], 'text-color', state.contourColors.major);
          }
        };
      }
      updateRampPicker();
      try {
        updateColorLayers(overlay);
        renderLegend(overlay, legend);
      } catch (cause) {
        const message = `Could not apply ${overlay.name || overlay.id} color ramp: ${cause.message}`;
        error.textContent = message;
        toast(message);
        updateRampPicker();
      }
      if (state.hillshadeOption && state.hillshadeEnabled) {
        try {
          createHillshade(overlay);
        } catch (cause) {
          state.hillshadeEnabled = false;
          shadeToggle.checked = false;
          const message = `Could not create a hillshade for ${overlay.name || overlay.id}: ${cause.message}`;
          error.textContent = message;
          toast(message);
        }
      }
      const cursorPosition = getCursorPosition();
      if (cursorPosition) scheduleCursorValues(cursorPosition);
      return true;
    };
    state.controlsInitializing = true;
    status.textContent = 'Inspecting COG bands…';
    setup().then(initialized => {
      if (initialized) state.controlsInitialized = true;
    }).catch(error => {
      const message = `Could not inspect ${overlay.name || overlay.id} COG: ${error.message}`;
      status.textContent = message;
      toast(message);
    }).finally(() => {
      state.controlsInitializing = false;
    });
  }

  return { initialize, renderLegend };
}
