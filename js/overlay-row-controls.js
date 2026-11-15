export function createOverlayRowControlsController({
  layerTools,
  infoFor,
  setOverlayTransparency,
  arcgisLegendRequest,
  collapser,
  collapseLayers,
  overlayHasZoomableExtent,
  overlayBounds,
  zoomButton
}) {
  function create({ overlay, groupName, row, rowElement, controlsMarkup = '' }) {
    const transparency = 100 - Math.round((overlay.opacity ?? 1) * 100);
    const tools = layerTools(
      transparency,
      infoFor(overlay.id, groupName, overlay.info),
      value => setOverlayTransparency(overlay, value),
      controlsMarkup
    );

    if (overlay.legendUrl || arcgisLegendRequest(overlay)) {
      rowElement.prepend(collapser(row, collapseLayers));
    } else {
      rowElement.insertAdjacentHTML('afterbegin', '<span class="cspace"></span>');
    }

    if (overlayHasZoomableExtent(overlay)) {
      rowElement.appendChild(zoomButton(
        overlay.name || overlay.id,
        () => overlayBounds(overlay),
        overlay.maxzoom
      ));
    }

    return { ...tools, rowElement };
  }

  function append({ row, rowElement, tools }) {
    if (tools.infoBtn) rowElement.appendChild(tools.infoBtn);
    rowElement.appendChild(tools.btn);
    if (tools.infoPanel) row.appendChild(tools.infoPanel);
    row.appendChild(tools.panel);
  }

  return { create, append };
}
