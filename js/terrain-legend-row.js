export function createTerrainLegendRowController({
  document,
  map,
  models,
  escapeHtml,
  slidersIcon,
  zoomButton,
  getActiveModel,
  setTerrainModel,
  getExaggeration,
  setExaggeration,
  getTerrainGroupHidden,
  isTerrainOn,
  setTerrain3D,
  setTerrainCheckbox,
  getBaseUrl,
  getCogMetadata
}) {
  function createRow(overlay, body) {
    const row = document.createElement('div');
    row.dataset.nokey = '1';
    const modelSelect = models.length > 1
      ? '<label class="trow">Model <select class="terrain-model">' + models.map(model =>
        `<option value="${escapeHtml(model.id)}">${escapeHtml(model.name)}</option>`).join('') + '</select></label>'
      : '';
    row.innerHTML = '<div class="grprow"><span class="cspace"></span><label class="lname"><input type="checkbox"> <span>' + escapeHtml(overlay.name) + '</span></label>' +
      '<button class="tbtn terrain-zoom" type="button"></button>' +
      '<button class="tbtn terrain-tools advanced-only" type="button" title="Terrain settings" aria-label="Terrain settings" aria-expanded="false">' + slidersIcon + '</button></div>' +
      '<div class="lpanel terrain-panel advanced-only" hidden>' + modelSelect + '<label class="trow">Exaggeration <input class="terrain-exaggeration" type="range" min="1" max="3" step="0.1" value="' + getExaggeration() + '"><span class="tval"></span></label></div>';

    const terrainZoom = zoomButton('selected DEM', () => {
      const model = getActiveModel();
      if (!model) throw new Error('No DEM is selected.');
      return getCogMetadata(new URL(model.cog, getBaseUrl()).href).then(metadata => metadata.bbox);
    }, () => getActiveModel()?.maxzoom);
    terrainZoom.classList.add('terrain-zoom');
    row.querySelector('.terrain-zoom').replaceWith(terrainZoom);

    const checkbox = row.querySelector('input');
    setTerrainCheckbox(checkbox);
    checkbox.onchange = () => setTerrain3D(checkbox.checked && !getTerrainGroupHidden(), false);

    const modelPicker = row.querySelector('.terrain-model');
    if (modelPicker) {
      modelPicker.value = getActiveModel()?.id;
      modelPicker.onchange = () => setTerrainModel(modelPicker.value);
    }

    const terrainTools = row.querySelector('.terrain-tools');
    const terrainPanel = row.querySelector('.lpanel');
    terrainTools.onclick = () => {
      terrainPanel.hidden = !terrainPanel.hidden;
      terrainTools.setAttribute('aria-expanded', String(!terrainPanel.hidden));
    };

    const terrainSlider = row.querySelector('.terrain-exaggeration');
    const terrainValue = row.querySelector('.tval');
    setExaggeration(Number(terrainSlider.value));
    terrainValue.textContent = Number(terrainSlider.value).toFixed(1) + 'x';
    terrainSlider.oninput = () => {
      const exaggeration = Number(terrainSlider.value);
      setExaggeration(exaggeration);
      terrainValue.textContent = exaggeration.toFixed(1) + 'x';
      const model = getActiveModel();
      if (isTerrainOn() && model) map.setTerrain({ source: model.sourceId, exaggeration });
    };

    body.appendChild(row);
    return row;
  }

  return { createRow };
}
