export function createArcgisLegendController({
  map,
  document,
  getOverlays,
  fetchImpl = fetch,
  baseUrl = globalThis.location?.href,
  warn = (...args) => console.warn(...args)
}) {
  const legendCache = new Map();
  const legendViews = new Map();
  const capabilityCache = new Map();
  const identifyDisabled = new Set();
  const viewValues = new Map();
  let lastViewKey = '';

  function request(overlay) {
    if (!overlay.url) return null;
    try {
      const url = new URL(overlay.url, baseUrl);
      const match = url.pathname.match(/^(.*\/MapServer)(?:\/(\d+))?\/?$/i);
      if (!match) return null;
      url.pathname = `${match[1]}/legend`;
      url.searchParams.set('f', 'json');
      const configured = overlay.layers || match[2];
      const layerIds = configured == null || configured === ''
        ? null
        : String(configured).replace(/^show:/i, '').split(',').map(id => id.trim()).filter(id => /^\d+$/.test(id));
      return { url: url.href, layerIds: layerIds?.length ? new Set(layerIds) : null };
    } catch {
      return null;
    }
  }

  function serviceUrl(legendRequest) {
    const url = new URL(legendRequest.url);
    url.pathname = url.pathname.replace(/\/legend$/i, '');
    url.searchParams.delete('f');
    return url;
  }

  function applyView(overlay) {
    const view = legendViews.get(overlay.id);
    if (!view) return;
    view.legend.querySelector('.arcgis-legend-empty')?.remove();
    view.legend.querySelectorAll('.arcgis-legend-note').forEach(note => note.remove());
    let filtered = 0, shown = 0;
    view.legend.querySelectorAll('.arcgis-legend-entry').forEach(row => {
      const values = row._arcgisValues;
      const inView = viewValues.get(`${view.serviceKey}|${row._arcgisLayerId}`);
      if (!Array.isArray(values) || !values.length || !inView) {
        row.classList.remove('nv');
        return;
      }
      const present = values.some(value => inView.has(String(value)));
      row.classList.toggle('nv', !present);
      filtered++;
      if (present) shown++;
    });
    if (filtered && !shown) {
      const note = document.createElement('div');
      note.className = 'arcgis-legend-empty';
      note.textContent = 'No symbols in the current view.';
      view.legend.appendChild(note);
    }
    if (view.notice) {
      const note = document.createElement('div');
      note.className = 'arcgis-legend-note';
      note.textContent = view.notice;
      view.legend.appendChild(note);
    }
  }

  function setServiceNotice(service, text) {
    const serviceKey = service.serviceUrl.href;
    service.layerIds.forEach(id => viewValues.delete(`${serviceKey}|${id}`));
    const targetId = service.overlays.find(overlay => legendViews.has(overlay.id))?.id;
    legendViews.forEach((view, id) => {
      if (view.serviceKey !== serviceKey) return;
      view.notice = id === targetId ? text : '';
      applyView({ id });
    });
  }

  function supportsQuery(url) {
    const queryUrl = new URL(url);
    queryUrl.searchParams.set('f', 'json');
    const key = queryUrl.href;
    if (!capabilityCache.has(key)) {
      capabilityCache.set(key, fetchImpl(key).then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      }).then(data => {
        if (data.error) throw new Error(data.error.message || 'ArcGIS service request failed');
        return String(data.capabilities || '').split(',').includes('Query');
      }));
    }
    return capabilityCache.get(key);
  }

  async function updateInView() {
    if (!map.getStyle()) return;
    const services = new Map();
    getOverlays().forEach(overlay => {
      if (!map.getLayer(overlay.id) || map.getLayoutProperty(overlay.id, 'visibility') !== 'visible') return;
      const legendRequest = request(overlay);
      if (!legendRequest || !legendRequest.layerIds) return;
      const service = serviceUrl(legendRequest);
      const serviceKey = service.href;
      if (!services.has(serviceKey)) services.set(serviceKey, { serviceUrl: service, layerIds: new Set(), overlays: [] });
      const group = services.get(serviceKey);
      legendRequest.layerIds.forEach(id => group.layerIds.add(id));
      group.overlays.push(overlay);
    });
    if (!services.size) return;
    const bounds = map.getBounds();
    const canvas = map.getCanvas();
    const extent = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
    const viewKey = `${extent.map(value => value.toFixed(5)).join(',')}|${canvas.clientWidth},${canvas.clientHeight}|` +
      [...services].map(([key, service]) => `${key}:${[...service.layerIds].sort().join(',')}`).sort().join('|');
    if (viewKey === lastViewKey) return;
    lastViewKey = viewKey;
    await Promise.all([...services.entries()].map(async ([serviceKey, service]) => {
      if (identifyDisabled.has(serviceKey)) {
        setServiceNotice(service, 'View filtering is unavailable for this service; all symbols are shown.');
        return;
      }
      try {
        if (!await supportsQuery(service.serviceUrl)) {
          identifyDisabled.add(serviceKey);
          setServiceNotice(service, 'View filtering is unavailable for this service; all symbols are shown.');
          return;
        }
        const url = new URL(service.serviceUrl);
        url.pathname += '/identify';
        const params = {
          f: 'json',
          geometry: JSON.stringify({
            xmin: extent[0], ymin: extent[1], xmax: extent[2], ymax: extent[3],
            spatialReference: { wkid: 4326 }
          }),
          geometryType: 'esriGeometryEnvelope',
          sr: '4326',
          mapExtent: extent.join(','),
          imageDisplay: `${canvas.clientWidth},${canvas.clientHeight},96`,
          tolerance: '3',
          layers: `visible:${[...service.layerIds].join(',')}`,
          returnGeometry: 'false'
        };
        Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
        const response = await fetchImpl(url.href);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error.message || 'ArcGIS identify request failed');
        const counts = new Map(), values = new Map();
        (data.results || []).forEach(result => {
          const id = String(result.layerId);
          counts.set(id, (counts.get(id) || 0) + 1);
          if (result.value !== undefined && result.value !== null && result.value !== '') {
            if (!values.has(id)) values.set(id, new Set());
            values.get(id).add(String(result.value));
          }
        });
        service.layerIds.forEach(id => {
          const count = counts.get(id) || 0, found = values.get(id);
          const key = `${serviceKey}|${id}`;
          if (count < 1000 && (!count || found?.size)) viewValues.set(key, found || new Set());
          else viewValues.delete(key);
        });
        service.overlays.forEach(applyView);
      } catch (error) {
        identifyDisabled.add(serviceKey);
        setServiceNotice(service, 'View filtering is unavailable for this service; all symbols are shown.');
        warn('Could not filter ArcGIS legend to the current view:', error);
      }
    }));
  }

  function legendData(url) {
    if (!legendCache.has(url)) {
      let pending;
      pending = fetchImpl(url).then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      }).then(data => {
        if (data.error) throw new Error(data.error.message || 'ArcGIS legend request failed');
        return data;
      }).catch(error => {
        if (legendCache.get(url) === pending) legendCache.delete(url);
        throw error;
      });
      legendCache.set(url, pending);
    }
    return legendCache.get(url);
  }

  function render(container, overlay) {
    const legendRequest = request(overlay);
    if (!legendRequest) return;
    const legend = document.createElement('div');
    legend.className = 'arcgis-legend';
    legend.textContent = 'Legend loads when this theme is active.';
    container.appendChild(legend);
    const key = serviceUrl(legendRequest).href;
    legendViews.set(overlay.id, { legend, serviceKey: key, request: legendRequest, notice: '', loading: false, loaded: false });
  }

  function load(overlay) {
    const view = legendViews.get(overlay.id);
    if (!view || view.loading || view.loaded) return;
    view.loading = true;
    view.legend.textContent = 'Loading legend…';
    legendData(view.request.url).then(data => {
      const layers = (data.layers || []).filter(layer =>
        !view.request.layerIds || view.request.layerIds.has(String(layer.layerId)));
      const entries = layers.flatMap(layer => (layer.legend || []).map(entry => ({ layer, entry })))
        .filter(({ entry }) => entry.imageData || entry.url);
      view.legend.replaceChildren();
      if (!entries.length) {
        view.legend.textContent = 'No legend entries available.';
        view.loaded = true;
        return;
      }
      entries.forEach(({ layer, entry }) => {
        const row = document.createElement('div');
        row.className = 'arcgis-legend-entry';
        row._arcgisLayerId = String(layer.layerId);
        row._arcgisValues = Array.isArray(entry.values) ? entry.values : [];
        const label = entry.label || layer.layerName || '';
        const image = document.createElement('img');
        image.alt = label;
        image.src = entry.imageData
          ? `data:${entry.contentType || 'image/png'};base64,${entry.imageData}`
          : new URL(entry.url, view.request.url).href;
        row.appendChild(image);
        if (entry.label) {
          const text = document.createElement('span');
          text.textContent = entry.label;
          row.appendChild(text);
        }
        view.legend.appendChild(row);
      });
      view.loaded = true;
      applyView(overlay);
    }).catch(error => {
      warn(`Could not load ArcGIS legend for ${overlay.name || overlay.id}:`, error);
      view.legend.textContent = 'Legend unavailable. Toggle the layer off and on to retry.';
    }).finally(() => {
      view.loading = false;
    });
  }

  return { request, render, load, updateInView };
}
