export function createOverlayDownloadController({
  document,
  window,
  navigator,
  URL,
  Blob,
  crypto,
  setTimeout,
  console,
  getBaseUrl,
  toast,
  prepareCogQgisStyle,
  cogQgisColorStops,
  buildQgisLayerDefinition,
  geojsonLegendCategories,
  geojsonFieldStats,
  buildGeojsonQgisLayerDefinition
}) {
  function cogDownloadControlsMarkup() {
    return `<section class="cog-download-section" aria-label="Download and source">
      <div class="cog-download-divider"></div>
      <h4>Download for Desktop GIS</h4>
      <div class="cog-download-actions">
        <button class="cog-qgis-download" type="button" aria-label="Download QGIS layer definition" title="Download QGIS layer definition (.qlr)">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h11l5 5v11H4z"/><path d="M15 4v5h5M8 14h8M8 17h5"/></svg><span>QGIS</span>
        </button>
        <button class="cog-arcpro-placeholder" type="button" aria-label="ArcGIS Pro export coming later" title="ArcGIS Pro export will be added later" disabled>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h11l5 5v11H4z"/><path d="M15 4v5h5M8 14h8M8 17h5"/></svg><span>ArcGIS Pro</span>
        </button>
        <button class="cog-source-copy" type="button" aria-label="Copy source URL to clipboard" title="Copy source URL to clipboard">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="7" width="12" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h2"/></svg><span>Copy URL</span>
        </button>
      </div>
      <div class="cog-download-status" role="status" aria-live="polite"></div>
    </section>`;
  }

  function geojsonDownloadControlsMarkup() {
    return `<section class="cog-download-section geojson-download-section" aria-label="Download and source">
      <div class="cog-download-divider"></div>
      <h4>Download for Desktop GIS</h4>
      <div class="cog-download-actions">
        <button class="geojson-qgis-download" type="button" aria-label="Download QGIS layer definition" title="Download QGIS layer definition (.qlr)">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h11l5 5v11H4z"/><path d="M15 4v5h5M8 14h8M8 17h5"/></svg><span>QGIS</span>
        </button>
        <button class="geojson-source-copy" type="button" aria-label="Copy source URL to clipboard" title="Copy source URL to clipboard">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="7" width="12" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h2"/></svg><span>Copy URL</span>
        </button>
      </div>
      <div class="cog-download-status geojson-download-status" role="status" aria-live="polite"></div>
    </section>`;
  }

  function bindCogDownloads({ overlay, copyButton, qgisButton, statusElement }) {
    qgisButton.onclick = async () => {
      qgisButton.disabled = true;
      statusElement.textContent = 'Preparing QGIS layer definition…';
      try {
        let hasSingleBandStyle = false;
        let style = null;
        let styleError = null;
        try {
          hasSingleBandStyle = await prepareCogQgisStyle(overlay);
          if (hasSingleBandStyle) style = cogQgisColorStops(overlay.cogState);
        } catch (error) {
          styleError = error;
          hasSingleBandStyle = overlay.cogState.bandCount !== 0;
          console.warn(`Could not prepare the ${overlay.name || overlay.id} QGIS color style; using grayscale.`, error);
        }

        const qgisId = `${overlay.id.replace(/[^A-Za-z0-9_-]+/g, '_')}_${crypto.randomUUID().replace(/-/g, '_')}`;
        const qlr = buildQgisLayerDefinition({
          id: qgisId,
          name: overlay.name || overlay.id,
          url: overlay.cogState.url,
          opacity: overlay.cogState.opacity,
          minimum: overlay.cogState.rangeMin,
          maximum: overlay.cogState.rangeMax,
          crsAuthId: overlay.qgisCrs || overlay.projection || 'EPSG:29902',
          renderer: hasSingleBandStyle ? 'gray' : 'none',
          ...(style || {})
        });
        const blobUrl = URL.createObjectURL(new Blob([qlr], { type: 'application/xml;charset=utf-8' }));
        const link = document.createElement('a');
        const filename = (overlay.name || overlay.id).replace(/[\\/:*?"<>|]+/g, '_').trim() || 'raster-layer';
        link.href = blobUrl;
        link.download = `${filename}.qlr`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
        statusElement.textContent = style
          ? 'QGIS layer definition downloaded with the current color style and breaks.'
          : hasSingleBandStyle
            ? `QGIS layer definition downloaded in single-band gray${styleError ? `; color style unavailable: ${styleError.message}` : ''}.`
            : 'QGIS layer definition downloaded; this multiband raster will use QGIS default rendering.';
        toast('QGIS layer definition downloaded');
      } catch (error) {
        console.error(`Could not export ${overlay.name || overlay.id} as a QGIS layer:`, error);
        statusElement.textContent = `Could not create QGIS layer definition: ${error.message}`;
        toast(`Could not create QGIS layer definition: ${error.message}`);
      } finally {
        qgisButton.disabled = false;
      }
    };

    copyButton.onclick = async () => {
      try {
        await navigator.clipboard.writeText(overlay.cogState.url);
        statusElement.textContent = 'Source URL copied to clipboard.';
        toast('COG source URL copied');
      } catch {
        window.prompt('Copy this source URL', overlay.cogState.url);
      }
    };
  }

  function bindGeojsonDownloads({ overlay, loader, copyButton, qgisButton, statusElement }) {
    const sourceUrl = new URL(overlay.url, getBaseUrl()).href;
    qgisButton.onclick = () => {
      qgisButton.disabled = true;
      statusElement.textContent = 'Preparing QGIS layer definition…';
      try {
        const categories = geojsonLegendCategories(overlay, loader);
        const fieldName = categories.find(category => category.field)?.field;
        const fieldStats = fieldName
          ? geojsonFieldStats(loader.data?.features || []).find(field => field.name === fieldName)
          : null;
        const qlr = buildGeojsonQgisLayerDefinition({
          id: `${overlay.id.replace(/[^A-Za-z0-9_-]+/g, '_')}_${crypto.randomUUID().replace(/-/g, '_')}`,
          name: overlay.name || overlay.id,
          url: sourceUrl,
          opacity: Number.isFinite(overlay.opacity) ? overlay.opacity : 1,
          crsAuthId: overlay.qgisCrs || overlay.projection || 'EPSG:4326',
          geometryTypes: loader.geometryTypes || [],
          geometryType: overlay.geometryType,
          style: overlay.style || {},
          categories,
          minimum: fieldStats?.min,
          maximum: fieldStats?.max
        });
        const blobUrl = URL.createObjectURL(new Blob([qlr], { type: 'application/xml;charset=utf-8' }));
        const link = document.createElement('a');
        const filename = (overlay.name || overlay.id).replace(/[\\/:*?"<>|]+/g, '_').trim() || 'geojson-layer';
        link.href = blobUrl;
        link.download = `${filename}.qlr`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
        statusElement.textContent = 'QGIS vector layer definition downloaded with the configured GeoJSON style.';
        toast('QGIS layer definition downloaded');
      } catch (error) {
        console.error(`Could not export ${overlay.name || overlay.id} as a QGIS vector layer:`, error);
        statusElement.textContent = `Could not create QGIS layer definition: ${error.message}`;
        toast(`Could not create QGIS layer definition: ${error.message}`);
      } finally {
        qgisButton.disabled = false;
      }
    };

    copyButton.onclick = async () => {
      try {
        await navigator.clipboard.writeText(sourceUrl);
        statusElement.textContent = 'Source URL copied to clipboard.';
        toast('GeoJSON source URL copied');
      } catch {
        statusElement.textContent = 'Clipboard unavailable; copy the URL from the prompt.';
        window.prompt('Copy this source URL', sourceUrl);
      }
    };
  }

  return {
    cogDownloadControlsMarkup,
    geojsonDownloadControlsMarkup,
    bindCogDownloads,
    bindGeojsonDownloads
  };
}
