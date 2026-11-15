export function createTerrainRuntimeController({
  map,
  terrainConfig,
  contourLineId,
  models,
  verifyTerrainRangeSupport,
  reportTerrainRangeError,
  ensureCogProtocol,
  isCogProtocolRegistered,
  getActiveModel,
  setActiveModel,
  setContoursVisible,
  removeTerrainContours,
  addTerrainModelSource,
  addHillshadeLayer,
  setupTerrainContours,
  getTerrainOn,
  setTerrainOn,
  getTerrainCheckbox,
  getTerrainGroupHidden,
  getTerrainLayerBeforeId,
  getTerrainExaggeration,
  setModelPickerValue,
  setTerrainButtonState,
  toast
}) {
  async function setTerrainModel(id) {
    const model = models.find(candidate => candidate.id === id);
    if (!model || model === getActiveModel()) return;
    try {
      await verifyTerrainRangeSupport(model);
    } catch (error) {
      reportTerrainRangeError(model, error);
      setModelPickerValue(getActiveModel()?.id || null);
      return;
    }

    if (map.getLayer(contourLineId))
      setContoursVisible(map.getLayoutProperty(contourLineId, 'visibility') !== 'none');
    removeTerrainContours();
    const hillshadeLayerExists = !!map.getLayer('hillshade');
    const hillshadeVisible = hillshadeLayerExists
      ? map.getLayoutProperty('hillshade', 'visibility') !== 'none'
      : !!terrainConfig.hillshadeVisible;
    if (hillshadeLayerExists) map.removeLayer('hillshade');
    setActiveModel(model);
    setModelPickerValue(model.id);
    if (getTerrainOn()) {
      addTerrainModelSource(model, 'terrain');
      map.setTerrain({ source: model.sourceId, exaggeration: getTerrainExaggeration() });
    }
    if (hillshadeLayerExists || hillshadeVisible)
      addHillshadeLayer(model, getTerrainLayerBeforeId(), hillshadeVisible);
    setupTerrainContours(model, getTerrainLayerBeforeId());
  }

  function setTerrain3D(on, syncCheckbox = true, tilt = true) {
    const activeModel = getActiveModel();
    const checkbox = getTerrainCheckbox();
    if (!terrainConfig || !activeModel) {
      if (checkbox) checkbox.checked = false;
      setTerrainButtonState(false);
      toast('3D view needs a DTM configured in CONFIG.terrain.models.');
      return;
    }
    if (on && !isCogProtocolRegistered()) {
      ensureCogProtocol()
        .then(() => setTerrain3D(on, syncCheckbox, tilt))
        .catch(error => {
          if (checkbox && syncCheckbox) checkbox.checked = false;
          toast(`Could not load COG support: ${error.message}`);
        });
      return;
    }
    setTerrainOn(on);
    if (checkbox && syncCheckbox) checkbox.checked = on;
    setTerrainButtonState(on);
    if (on) {
      addTerrainModelSource(activeModel, 'terrain');
      map.setTerrain({ source: activeModel.sourceId, exaggeration: getTerrainExaggeration() });
      if (tilt) map.easeTo({ pitch: terrainConfig.pitch ?? 60, duration: 900 });
    } else {
      map.setTerrain(null);
      if (tilt) map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
    }
  }

  function attachMapListeners() {
    map.on('pitchstart', event => {
      if (event.originalEvent && !getTerrainOn() && !getTerrainGroupHidden() && getActiveModel())
        setTerrain3D(true, true, false);
    });
    map.on('moveend', () => {
      if (getTerrainOn() && map.getPitch() < 1) setTerrain3D(false);
    });
  }

  return { setTerrainModel, setTerrain3D, attachMapListeners };
}
