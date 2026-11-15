export function createOverlayVisibilityController({
  isCogProtocolRegistered,
  ensureCogProtocol,
  notify,
  setContoursVisible,
  addHillshadeLayer,
  getActiveTerrainModel,
  getTerrainLayerBeforeId,
  setClassFilters,
  setLayerVisibility,
  syncCogLayerMode,
  ensurePendingCogLayer,
  initializeVisibleCogControls,
  getCursorPosition,
  scheduleCogCursorValues,
  getLayerVisibility,
  ensureOverlaySymbology,
  setThemeLayerVisibility
}) {
  function bind({ overlay, checkbox, row, layerIds, geojsonLoader }) {
    function setOverlayVisibility(on) {
      if (overlay.hillshade && on && !isCogProtocolRegistered()) {
        ensureCogProtocol()
          .then(() => setOverlayVisibility(on))
          .catch(error => notify(`Could not load COG support: ${error.message}`));
        return;
      }

      checkbox.checked = on;
      row.classList.toggle('legend-off', !on);
      if (overlay.contours) setContoursVisible(checkbox.checked);
      if (overlay.hillshade && on) {
        addHillshadeLayer(getActiveTerrainModel(), getTerrainLayerBeforeId(), false);
      }

      if (geojsonLoader?.classState) {
        geojsonLoader.categoryIsolationController?.clear();
        geojsonLoader.classState.hidden.clear();
        if (!on) geojsonLoader.classState.categories.forEach(category => geojsonLoader.classState.hidden.add(category));
        geojsonLoader.classInputs.forEach(input => { input.checked = on; });
        setClassFilters(layerIds, geojsonLoader.classState);
        setLayerVisibility(layerIds, on);
      } else if (overlay.cogState) {
        overlay.cogState.visible = on;
        syncCogLayerMode(overlay);
        if (on) ensurePendingCogLayer(overlay);
        initializeVisibleCogControls();
        const cursorPosition = getCursorPosition();
        if (cursorPosition) scheduleCogCursorValues(cursorPosition);
      } else setLayerVisibility(layerIds, on);

      if (on && getLayerVisibility(overlay.id)?.inTheme) ensureOverlaySymbology(overlay);
    }

    return setOverlayVisibility;
  }

  function setThemeVisibility(overlay, layerIds, on) {
    setThemeLayerVisibility(layerIds, on);
    if (on && overlay.cogState) {
      ensurePendingCogLayer(overlay);
      initializeVisibleCogControls();
    }
    if (on) ensureOverlaySymbology(overlay);
  }

  return { bind, setThemeVisibility };
}
