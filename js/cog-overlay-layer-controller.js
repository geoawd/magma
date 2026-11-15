import { validateCogClasses } from './cog-classes.js';
import { COG_DEFAULT_RAMP, COG_RAMP_COLORS } from './cog-style.js';

export function createCogOverlayLayerController({
  map,
  config,
  baseUrl,
  getStartupSnapshot,
  getContourSettings,
  resamplingUrl,
  hillshadeDefaults,
  registerLayerVisibility,
  isInitiallyInTheme,
  layerVisibility,
  isProtocolRegistered,
  ensureProtocol,
  syncLayerVisibility,
  initializeVisibleControls,
  effectiveHillshadeStrength,
  notify
}) {
  function addCogLayer(overlay, beforeId, isBasemap = false) {
    const cogUrl = new URL(overlay.cog, baseUrl).href;
    const baseUrlWithoutFragment = new URL(cogUrl);
    baseUrlWithoutFragment.hash = '';
    const startupSnapshot = getStartupSnapshot();
    const saved = startupSnapshot?.cogs?.[overlay.id];
    if (saved && Number.isFinite(saved.opacity) && saved.opacity >= 0 && saved.opacity <= 1) {
      overlay.opacity = saved.opacity;
    }
    const configuredStyle = { ...config.cogStyleDefaults, ...overlay.cogStyle };
    const configuredRamp = typeof configuredStyle.ramp === 'string' && configuredStyle.ramp in COG_RAMP_COLORS
      ? configuredStyle.ramp : COG_DEFAULT_RAMP;
    const ramp = typeof saved?.ramp === 'string' && (saved.ramp === '' || saved.ramp in COG_RAMP_COLORS)
      ? saved.ramp : configuredRamp;
    const classes = overlay.classes === undefined ? [] : validateCogClasses(overlay.classes);
    const availableModes = ['continuous', 'quantile', 'percentile', ...(classes.length ? ['classes'] : [])];
    const configuredMode = classes.length ? 'classes'
      : availableModes.includes(configuredStyle.mode) ? configuredStyle.mode : 'quantile';
    const mode = availableModes.includes(saved?.mode) ? saved.mode : configuredMode;
    const configuredHillshade = overlay.hillshade_option === true || overlay.hillshade_option === 'true';
    const configuredContours = getContourSettings(overlay, saved);
    const savedHillshadePreference = saved?.hillshadePreferenceSet === true;
    const savedOverlays = startupSnapshot?.overlays;
    overlay.cogState = {
      url: baseUrlWithoutFragment.href,
      resampling: overlay.resampling,
      valueReadoutAvailable: false,
      colorLayerIds: [],
      hillshadeSourceId: `${overlay.id}__hillshade_source`,
      hillshadeLayerId: `${overlay.id}__hillshade`,
      hillshadeCreated: false,
      hillshadeOption: configuredHillshade,
      hillshadeEnabled: configuredHillshade && savedHillshadePreference && typeof saved.hillshadeEnabled === 'boolean'
        ? saved.hillshadeEnabled : configuredHillshade,
      hillshadePreferenceSet: savedHillshadePreference,
      contourOption: configuredContours.option,
      contoursEnabled: configuredContours.enabled,
      contourPreferenceSet: configuredContours.preferenceSet,
      contourIntervals: configuredContours.intervals,
      contourColors: configuredContours.colors,
      contourUnits: typeof overlay.legendunits === 'string' ? overlay.legendunits : '',
      contourSourceId: `${overlay.id}__contour_source`,
      contourLayerIds: configuredContours.option
        ? [`${overlay.id}__contour_lines`, `${overlay.id}__contour_labels`]
        : [],
      contoursCreated: false,
      contourGeneration: 0,
      contourPromise: null,
      contourToggle: null,
      hillshadeStrength: Number.isFinite(saved?.hillshadeStrength)
        ? Math.max(0, Math.min(1, saved.hillshadeStrength)) : hillshadeDefaults.strength,
      hillshadeVerticalScale: 1,
      restoredHillshadeVerticalScale: Number.isFinite(saved?.hillshadeVerticalScale)
        ? saved.hillshadeVerticalScale : null,
      hillshadeVerticalCenter: 0,
      visible: typeof savedOverlays?.[overlay.id] === 'boolean'
        ? savedOverlays[overlay.id] : overlay.visible === true,
      opacity: overlay.opacity ?? 1,
      legendUnits: typeof overlay.legendunits === 'string' ? overlay.legendunits : '',
      rangeMin: null,
      rangeMax: null,
      bandCount: null,
      quantileBounds: [],
      percentileRange: null,
      classes,
      mode,
      ramp,
      controlsInitialized: false,
      controlsInitializing: false
    };
    overlay.visible = overlay.cogState.visible;
    overlay.layerIds = [overlay.id, overlay.cogState.hillshadeLayerId, ...overlay.cogState.contourLayerIds];

    const source = {
      type: 'raster',
      url: resamplingUrl(`cog://${cogUrl}`, overlay.resampling),
      tileSize: overlay.tileSize || 256
    };
    if (overlay.attribution) source.attribution = overlay.attribution;
    if (Number.isFinite(overlay.maxzoom)) source.maxzoom = overlay.maxzoom;
    if (!isBasemap) {
      overlay.cogState.pendingSource = source;
      overlay.cogState.pendingBeforeId = beforeId;
      registerLayerVisibility(overlay.id, overlay.visible === true, isInitiallyInTheme(overlay));
      ensurePendingLayer(overlay);
      return true;
    }
    if (!map.getSource(overlay.id)) map.addSource(overlay.id, source);
    const layer = {
      id: overlay.id,
      type: 'raster',
      source: overlay.id,
      layout: { visibility: 'none' },
      paint: { 'raster-opacity': overlay.opacity ?? 1 }
    };
    if (Number.isFinite(overlay.minzoom)) layer.minzoom = overlay.minzoom;
    if (Number.isFinite(overlay.maxzoom)) layer.maxzoom = overlay.maxzoom;
    map.addLayer(layer, beforeId);
    registerLayerVisibility(overlay.id, overlay.visible === true, true);
    return true;
  }

  function ensurePendingLayer(overlay) {
    const state = overlay.cogState;
    const visibility = layerVisibility.get(overlay.id);
    if (!state?.pendingSource || !visibility?.selected || !visibility.inTheme ||
        visibility.groups.size || map.getLayer(overlay.id)) return false;
    if (!isProtocolRegistered()) {
      ensureProtocol().then(() => {
        if (ensurePendingLayer(overlay)) initializeVisibleControls();
      }).catch(error => notify(`Could not load ${overlay.name || overlay.id}: ${error.message}`));
      return false;
    }
    if (!map.getSource(overlay.id)) map.addSource(overlay.id, state.pendingSource);
    const layer = {
      id: overlay.id,
      type: 'raster',
      source: overlay.id,
      layout: { visibility: 'none' },
      paint: { 'raster-opacity': overlay.opacity ?? 1 }
    };
    if (Number.isFinite(overlay.minzoom)) layer.minzoom = overlay.minzoom;
    if (Number.isFinite(overlay.maxzoom)) layer.maxzoom = overlay.maxzoom;
    const beforeId = map.getLayer(state.pendingBeforeId) ? state.pendingBeforeId : undefined;
    map.addLayer(layer, beforeId);
    state.pendingSource = null;
    syncLayerVisibility(overlay.id);
    return true;
  }

  function setOpacity(overlay, opacity) {
    const state = overlay.cogState;
    state.opacity = opacity;
    [overlay.id, ...state.colorLayerIds].forEach(id => {
      if (map.getLayer(id)) map.setPaintProperty(id, 'raster-opacity', opacity);
    });
    if (map.getLayer(state.hillshadeLayerId)) {
      map.setPaintProperty(state.hillshadeLayerId, 'hillshade-exaggeration',
        effectiveHillshadeStrength(state));
    }
  }

  return { addCogLayer, ensurePendingLayer, setOpacity };
}
