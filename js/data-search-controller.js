export function createDataSearchController({
  map,
  layerSelect,
  textInput,
  fieldsElement,
  runButton,
  getConfig,
  geojsonLoaders,
  getActiveThemeAll,
  getThemeOverlays,
  getThemeLayers,
  queryData,
  wholeMap,
  loadGeojsonData,
  styleLayerKey,
  styleLayerLabel,
  escapeHtml,
  toast,
  showTable,
  setActiveTab,
  isMobile,
  getActiveTool,
  openTool
}) {
  function pmtilesSearchLayers() {
    return [...new Set(map.getStyle().layers.filter(layer => layer['source-layer']).map(styleLayerKey))]
      .filter(layer => !getThemeLayers() || getThemeLayers().includes(layer));
  }

  function pmtilesSearchLabel(layer) {
    return styleLayerLabel(map.getStyle(), layer);
  }

  function populateSearchLayers() {
    const config = getConfig();
    const geojsonLayers = (config.overlays || []).filter(overlay => overlay.geojson &&
      geojsonLoaders.has(overlay.id) && (getActiveThemeAll() || getThemeOverlays().includes(overlay.id)));
    const pmtilesLayers = pmtilesSearchLayers();
    const options = [
      ...geojsonLayers.map(overlay =>
        `<option value="geojson:${escapeHtml(overlay.id)}">${escapeHtml(overlay.name || overlay.id)}</option>`),
      ...pmtilesLayers.map(layer =>
        `<option value="pmtiles:${escapeHtml(layer)}">${escapeHtml(pmtilesSearchLabel(layer))}</option>`)
    ];
    layerSelect.innerHTML = options.join('');
    updateSearchFields();
  }

  function renderSearchFields(properties, layer) {
    const fields = Object.keys(properties || {});
    fieldsElement.innerHTML = fields.length
      ? fields.map(field => `<label><input type="checkbox" value="${escapeHtml(field)}" checked>${escapeHtml(field)}</label>`).join('')
      : `<em class="hint">${layer ? 'No searchable fields in this layer.' : 'This theme has no searchable layers.'}</em>`;
  }

  function updatePmtilesSearchFields(layer) {
    const sample = queryData(wholeMap()).find(feature => feature.sourceLayer === layer);
    if (sample) renderSearchFields(sample.properties, layer);
    else fieldsElement.innerHTML =
      `<em class="hint">${layer ? 'No fields yet – make sure this layer is visible in the current view.' : 'This theme has no searchable layers.'}</em>`;
  }

  async function updateSearchFields() {
    const selection = layerSelect.value;
    const separator = selection.indexOf(':');
    const type = separator < 0 ? '' : selection.slice(0, separator);
    const layer = separator < 0 ? '' : selection.slice(separator + 1);
    if (type !== 'geojson') {
      updatePmtilesSearchFields(type === 'pmtiles' ? layer : '');
      return;
    }
    const loader = geojsonLoaders.get(layer);
    if (!loader) {
      fieldsElement.innerHTML = '<em class="hint">This GeoJSON layer is unavailable.</em>';
      return;
    }
    fieldsElement.innerHTML = '<em class="hint">Loading GeoJSON fields...</em>';
    await loadGeojsonData(layer);
    if (layerSelect.value !== selection) return;
    if (loader.status === 'error') {
      fieldsElement.innerHTML = '<em class="hint">Could not load this GeoJSON file. Try selecting the layer again.</em>';
      return;
    }
    const sample = loader.data?.features?.find(feature => feature.properties && Object.keys(feature.properties).length);
    renderSearchFields(sample?.properties, layer);
  }

  async function runSearch() {
    const text = textInput.value.trim().toLowerCase();
    if (!text) {
      textInput.focus();
      return;
    }
    const selection = layerSelect.value;
    const separator = selection.indexOf(':');
    const type = separator < 0 ? '' : selection.slice(0, separator);
    const layer = separator < 0 ? '' : selection.slice(separator + 1);
    if (type === 'geojson') {
      const loader = geojsonLoaders.get(layer);
      if (!loader) return toast('The selected GeoJSON layer is unavailable.');
      await loadGeojsonData(layer);
      if (loader.status !== 'loaded') return;
      if (!fieldsElement.querySelector('input')) {
        renderSearchFields(loader.data?.features?.find(feature => feature.properties)?.properties, layer);
      }
    }
    const fields = [...fieldsElement.querySelectorAll('input:checked')].map(checkbox => checkbox.value);
    const matches = type === 'geojson'
      ? geojsonLoaders.get(layer).data.features.filter(feature =>
        fields.some(field => feature.properties?.[field] != null &&
          String(feature.properties[field]).toLowerCase().includes(text)))
        .map(feature => ({ ...feature, sourceLayer: geojsonLoaders.get(layer).config.name || layer }))
      : type === 'pmtiles'
        ? queryData(wholeMap()).filter(feature => feature.sourceLayer === layer &&
          fields.some(field => feature.properties[field] != null &&
            String(feature.properties[field]).toLowerCase().includes(text)))
        : [];
    setActiveTab(null);
    showTable(matches, `${matches.length} search result(s)`);
    const activeTool = getActiveTool();
    if (isMobile()) openTool(activeTool);
  }

  layerSelect.addEventListener('change', updateSearchFields);
  runButton.addEventListener('click', runSearch);
  textInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') runSearch();
  });

  return { populateSearchLayers, updateSearchFields, runSearch };
}
