export function createMapLayerVisibilityController({
  map,
  state,
  isGeojsonLoadingEnabled,
  loadGeojsonData,
  updateScaleState,
  updateArcgisLegendInView,
  initializeVisibleCogControls,
  getCursorPosition,
  scheduleCogCursorValues,
  allOverlays,
  ensurePendingCogLayer
}) {
  function registerLayerVisibility(id, selected, inTheme = true) {
    if (!state.has(id)) state.set(id, { selected, inTheme, groups: new Set() });
    syncLayerVisibility(id);
  }

  function syncLayerVisibility(id) {
    const layerState = state.get(id);
    if (!layerState || !map.getLayer(id)) return;
    const visible = layerState.selected && layerState.inTheme && !layerState.groups.size;
    map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    if (visible && !layerState.effectiveVisible && isGeojsonLoadingEnabled()) loadGeojsonData(id);
    layerState.effectiveVisible = visible;
  }

  function setVis(ids, on) {
    ids.forEach(id => {
      const layerState = state.get(id) || { selected: false, inTheme: true, groups: new Set() };
      layerState.selected = on;
      state.set(id, layerState);
      syncLayerVisibility(id);
    });
    updateScaleState();
    updateArcgisLegendInView();
  }

  function setThemeVisibility(ids, on) {
    ids.forEach(id => {
      const layerState = state.get(id);
      if (!layerState) return;
      layerState.inTheme = on;
      syncLayerVisibility(id);
    });
    initializeVisibleCogControls();
    const cursorPosition = getCursorPosition();
    if (cursorPosition) scheduleCogCursorValues(cursorPosition);
    updateArcgisLegendInView();
  }

  function setGroupVisibility(ids, key, on) {
    ids.forEach(id => {
      const layerState = state.get(id);
      if (!layerState) return;
      on ? layerState.groups.delete(key) : layerState.groups.add(key);
      syncLayerVisibility(id);
    });
    allOverlays().forEach(overlay => {
      if (overlay.cogState) ensurePendingCogLayer(overlay);
    });
    initializeVisibleCogControls();
    updateArcgisLegendInView();
  }

  return { registerLayerVisibility, syncLayerVisibility, setVis, setThemeVisibility, setGroupVisibility };
}
