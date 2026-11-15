export function createOverlayLegendController({
  getLegendElement,
  overlayLegendGroups,
  allOverlays,
  addGroup,
  terrainLegendRowController,
  document,
  escapeHtml,
  geojsonLoaders,
  updateGeojsonLoadStatus,
  renderGeojsonLegend,
  overlayVisibilityController,
  controls,
  overlayDownloadController,
  overlayRowControlsController,
  hillshadeControlsMarkup,
  contourControlsMarkup,
  colorRampIcon,
  geojsonStyleController,
  bindHillshadeControls,
  bindContourControls,
  overlayLegendImages,
  renderArcgisLegend,
  ensureOverlaySymbology,
  onTerrainGroupVisibilityChange
}) {
  function build(overlays = allOverlays()) {
    const legend = getLegendElement();
    const byGroup = {};
    overlays.forEach(overlay => (byGroup[overlay.group || 'Overlays'] ||= []).push(overlay));
    Object.entries(byGroup).forEach(([name, list]) => {
      let group = overlayLegendGroups.get(name);
      if (!group) {
        group = addGroup(legend, name);
        overlayLegendGroups.set(name, group);
      }
      const body = group.body;
      list.forEach(overlay => {
        if (overlay.terrain) {
          terrainLegendRowController.createRow(overlay, body);
          return;
        }
        const row = document.createElement('div');
        row.dataset.orderKey = `overlay:${overlay.id}`;
        if (overlay.geojson) row.dataset.scaleId = overlay.id;
        row.classList.toggle('legend-off', overlay.visible !== true);
        row.draggable = true;
        row.title = `Drag to reorder ${overlay.name || overlay.id}`;
        const scaleEye = overlay.geojson
          ? '<svg class="eye" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/><line x1="3" y1="21" x2="21" y2="3"/></svg>'
          : '';
        const geojsonStatus = overlay.geojson
          ? '<div class="geojson-load-status" role="status" aria-live="polite" hidden></div>'
          : '';
        const geojsonLegend = overlay.geojson ? '<div class="geojson-class-legend" hidden></div>' : '';
        row.innerHTML = `<div class="grprow"><label class="lname"><input type="checkbox"${overlay.visible === true ? ' checked' : ''}> <span class="grp">${escapeHtml(overlay.name || overlay.id)}${scaleEye}</span></label></div>${geojsonLegend}${geojsonStatus}`;
        const checkbox = row.querySelector('input');
        const layerIds = overlay.layerIds || [overlay.id];
        const geojsonLoader = overlay.geojson ? geojsonLoaders.get(overlay.id) : null;
        if (geojsonLoader) {
          geojsonLoader.statusElement = row.querySelector('.geojson-load-status');
          geojsonLoader.legendContainer = row.querySelector('.geojson-class-legend');
          geojsonLoader.rowElement = row;
          geojsonLoader.rootCheckbox = checkbox;
          updateGeojsonLoadStatus(overlay.id);
          renderGeojsonLegend(overlay);
        }
        const setOverlayVisibility = overlayVisibilityController.bind({
          overlay, checkbox, row, layerIds, geojsonLoader
        });
        checkbox.onchange = () => setOverlayVisibility(checkbox.checked);
        if (!overlay.global) controls.ov[overlay.id] = {
          theme: visible => overlayVisibilityController.setThemeVisibility(overlay, layerIds, visible),
          set: setOverlayVisibility,
          el: row
        };
        const cogControls = overlay.cogState
          ? `<div class="cog-ramp-controls">
              <div class="cog-ramp-advanced-controls advanced-only"><div class="cog-ramp-status" role="status">Enable this layer to load its COG controls.</div></div>
              ${overlayDownloadController.cogDownloadControlsMarkup()}
            </div>`
          : '';
        const geojsonControls = overlay.geojson ? overlayDownloadController.geojsonDownloadControlsMarkup() : '';
        const tools = overlayRowControlsController.create({
          overlay,
          groupName: name,
          row,
          rowElement: row.querySelector('.grprow'),
          controlsMarkup: overlay.hillshade
            ? hillshadeControlsMarkup()
            : overlay.contours
              ? contourControlsMarkup()
              : geojsonControls || cogControls
        });
        const rowElement = tools.rowElement;
        if (geojsonLoader) {
          const classifyButton = document.createElement('button');
          classifyButton.type = 'button';
          classifyButton.className = 'tbtn geojson-classify-button advanced-only';
          classifyButton.innerHTML = colorRampIcon;
          classifyButton.setAttribute('aria-label', `Classify ${overlay.name || overlay.id}`);
          classifyButton.onclick = () => geojsonStyleController.open(overlay);
          geojsonLoader.classifyButton = classifyButton;
          rowElement.appendChild(classifyButton);
          updateGeojsonLoadStatus(overlay.id);
        }
        overlayRowControlsController.append({ row, rowElement, tools });
        if (geojsonLoader?.legendContainer) row.appendChild(geojsonLoader.legendContainer);
        if (overlay.cogState) {
          const copySource = tools.panel.querySelector('.cog-source-copy');
          const qgisDownload = tools.panel.querySelector('.cog-qgis-download');
          const downloadStatus = tools.panel.querySelector('.cog-download-status');
          overlayDownloadController.bindCogDownloads({
            overlay, copyButton: copySource, qgisButton: qgisDownload, statusElement: downloadStatus
          });
          const legend = document.createElement('div');
          legend.className = 'cog-ramp-legend';
          legend.hidden = true;
          row.appendChild(legend);
          overlay.cogState.controlsPanel = tools.panel;
          overlay.cogState.controlsLegend = legend;
        }
        if (geojsonLoader) {
          const copySource = tools.panel.querySelector('.geojson-source-copy');
          const qgisDownload = tools.panel.querySelector('.geojson-qgis-download');
          const downloadStatus = tools.panel.querySelector('.geojson-download-status');
          overlayDownloadController.bindGeojsonDownloads({
            overlay,
            loader: geojsonLoader,
            copyButton: copySource,
            qgisButton: qgisDownload,
            statusElement: downloadStatus
          });
        }
        if (overlay.hillshade) bindHillshadeControls(tools.panel);
        if (overlay.contours) bindContourControls(tools.panel);
        if (overlay.legendUrl) overlayLegendImages.set(overlay.id, row);
        else renderArcgisLegend(row, overlay);
        body.appendChild(row);
        if (overlay.global) ensureOverlaySymbology(overlay);
        layerIds.forEach(id => group.layerIds.add(id));
        if (overlay.cogState) overlay.groupLayerIds = group.layerIds;
      });
      if (list.some(overlay => overlay.terrain)) {
        group.onVisibilityChange = visible => onTerrainGroupVisibilityChange(visible);
      }
    });
  }

  return { build };
}
