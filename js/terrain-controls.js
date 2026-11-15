const HILLSHADE_METHODS = [
  ['standard', 'Standard'], ['basic', 'Basic'], ['combined', 'Combined'],
  ['igor', 'Igor'], ['multidirectional', 'Multidirectional']
];
const HILLSHADE_STYLE_DEFAULTS = {
  method: 'standard', direction: 335, altitude: 45, anchor: 'map',
  shadowColor: '#000000', highlightColor: '#ffffff', accentColor: '#000000'
};

export function createTerrainControlsController({
  map,
  document,
  terrain = {},
  escapeHtml = String,
  contourLineId,
  contourLabelId
}) {
  const hillshadeStyle = { ...HILLSHADE_STYLE_DEFAULTS, ...(terrain.hillshadeStyle || {}) };
  const contourSettings = terrain.contours;
  const contourColors = { minor: '#30383b', major: '#30383b', ...(contourSettings && contourSettings.colors || {}) };
  const state = {
    hillshadeStyle,
    contourColors,
    contourOpacity: contourSettings && typeof contourSettings === 'object'
      ? contourSettings.opacity ?? 0.8
      : 0.8
  };
  const hillshadeMax = () => terrain.hillshadeStrength ?? 0.6;
  let shadeStrength = hillshadeMax();

  function hillshadePaint() {
    return {
      'hillshade-exaggeration': shadeStrength,
      'hillshade-method': hillshadeStyle.method,
      'hillshade-illumination-direction': hillshadeStyle.direction,
      'hillshade-illumination-altitude': hillshadeStyle.altitude,
      'hillshade-illumination-anchor': hillshadeStyle.anchor,
      'hillshade-shadow-color': hillshadeStyle.shadowColor,
      'hillshade-highlight-color': hillshadeStyle.highlightColor,
      'hillshade-accent-color': hillshadeStyle.accentColor
    };
  }

  function setHillshadeTransparency(value) {
    shadeStrength = hillshadeMax() * (1 - value / 100);
    map.setPaintProperty('hillshade', 'hillshade-exaggeration', shadeStrength);
  }

  function setContourTransparency(value) {
    state.contourOpacity = 1 - value / 100;
    if (map.getLayer(contourLineId)) map.setPaintProperty(contourLineId, 'line-opacity', state.contourOpacity);
    if (map.getLayer(contourLabelId)) map.setPaintProperty(contourLabelId, 'text-opacity', state.contourOpacity);
  }

  function contourLineColor() {
    return ['match', ['get', 'level'], 1, contourColors.major, contourColors.minor];
  }

  function hillshadeControlsMarkup() {
    return '<div class="hillshade-settings advanced-only">' +
      '<label class="trow">Method <select class="hs-method">' + HILLSHADE_METHODS.map(([value, label]) =>
        `<option value="${value}"${hillshadeStyle.method === value ? ' selected' : ''}>${label}</option>`).join('') + '</select></label>' +
      '<label class="trow">Light direction <input class="hs-direction" type="range" min="0" max="359" step="1" value="' + hillshadeStyle.direction + '"><output class="hs-direction-value">' + hillshadeStyle.direction + '°</output></label>' +
      '<label class="trow">Light altitude <input class="hs-altitude" type="range" min="0" max="90" step="1" value="' + hillshadeStyle.altitude + '"><output class="hs-altitude-value">' + hillshadeStyle.altitude + '°</output></label>' +
      '<label class="trow">Illumination <select class="hs-anchor"><option value="map">Map north</option><option value="viewport">Viewport</option></select></label>' +
      '<div class="hillshade-colors">' +
        '<label>Shadow <input class="hs-shadow" type="color" value="' + escapeHtml(hillshadeStyle.shadowColor) + '"></label>' +
        '<label>Highlight <input class="hs-highlight" type="color" value="' + escapeHtml(hillshadeStyle.highlightColor) + '"></label>' +
        '<label>Accent <input class="hs-accent" type="color" value="' + escapeHtml(hillshadeStyle.accentColor) + '"></label>' +
      '</div></div>';
  }

  function bindHillshadeControls(panel) {
    const paintProps = {
      method: 'hillshade-method', direction: 'hillshade-illumination-direction',
      altitude: 'hillshade-illumination-altitude', anchor: 'hillshade-illumination-anchor',
      shadowColor: 'hillshade-shadow-color', highlightColor: 'hillshade-highlight-color', accentColor: 'hillshade-accent-color'
    };
    const setStyle = (key, value) => {
      hillshadeStyle[key] = value;
      if (map.getLayer('hillshade')) map.setPaintProperty('hillshade', paintProps[key], value);
    };
    const method = panel.querySelector('.hs-method');
    method.value = hillshadeStyle.method;
    method.onchange = () => setStyle('method', method.value);
    const anchor = panel.querySelector('.hs-anchor');
    anchor.value = hillshadeStyle.anchor;
    anchor.onchange = () => setStyle('anchor', anchor.value);
    const direction = panel.querySelector('.hs-direction'), directionValue = panel.querySelector('.hs-direction-value');
    direction.oninput = () => { directionValue.value = direction.value + '°'; setStyle('direction', Number(direction.value)); };
    const altitude = panel.querySelector('.hs-altitude'), altitudeValue = panel.querySelector('.hs-altitude-value');
    altitude.oninput = () => { altitudeValue.value = altitude.value + '°'; setStyle('altitude', Number(altitude.value)); };
    [['shadowColor', '.hs-shadow'], ['highlightColor', '.hs-highlight'], ['accentColor', '.hs-accent']].forEach(([key, selector]) => {
      const input = panel.querySelector(selector);
      input.oninput = () => setStyle(key, input.value);
    });
  }

  function contourControlsMarkup() {
    return '<div class="hillshade-colors advanced-only">' +
      '<label>Minor <input class="ct-minor" type="color" value="' + escapeHtml(contourColors.minor) + '"></label>' +
      '<label>Major <input class="ct-major" type="color" value="' + escapeHtml(contourColors.major) + '"></label></div>';
  }

  function bindContourControls(panel) {
    const apply = () => {
      if (map.getLayer(contourLineId)) map.setPaintProperty(contourLineId, 'line-color', contourLineColor());
      if (map.getLayer(contourLabelId)) map.setPaintProperty(contourLabelId, 'text-color', contourColors.major);
    };
    [['minor', '.ct-minor'], ['major', '.ct-major']].forEach(([key, selector]) => {
      const input = panel.querySelector(selector);
      input.oninput = () => { contourColors[key] = input.value; apply(); };
    });
  }

  return {
    state,
    hillshadeMethods: HILLSHADE_METHODS,
    hillshadePaint,
    setHillshadeTransparency,
    setContourTransparency,
    contourLineColor,
    hillshadeControlsMarkup,
    bindHillshadeControls,
    contourControlsMarkup,
    bindContourControls
  };
}
