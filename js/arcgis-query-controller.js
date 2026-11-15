import { arcgisLayerIds, buildArcgisQueryUrl, parseArcgisQueryResponse } from './arcgis-query.js';

export function createArcgisQueryController({
  getOverlays,
  fetchImpl = globalThis.fetch,
  notify = () => {}
}) {
  if (typeof getOverlays !== 'function') throw new TypeError('getOverlays must be a function.');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function.');

  let activeController = null;

  const cancel = () => {
    activeController?.abort();
    activeController = null;
  };

  const query = async (geometry, geometryType = 'esriGeometryEnvelope', includeGeometry = false) => {
    cancel();
    const controller = new AbortController();
    activeController = controller;
    const jobs = [];
    const errors = [];

    getOverlays().forEach(overlay => {
      try {
        arcgisLayerIds(overlay.layers, overlay.url).forEach(layerId => {
          jobs.push({
            overlay,
            run: async () => {
              const response = await fetchImpl(
                buildArcgisQueryUrl(overlay.url, layerId, geometry, geometryType, includeGeometry),
                { signal: controller.signal }
              );
              if (!response.ok) throw new Error(`HTTP ${response.status}`);
              return parseArcgisQueryResponse(await response.json(), { includeGeometry }).map(result => ({
                sourceLayer: overlay.name || overlay.id,
                layer: { id: overlay.id },
                properties: includeGeometry ? result.attributes : result,
                ...(includeGeometry && result.geometry ? { geometry: result.geometry } : {})
              }));
            }
          });
        });
      } catch (error) {
        errors.push(`${overlay.name || overlay.id}: ${error.message}`);
      }
    });

    try {
      const results = await Promise.allSettled(jobs.map(job => job.run()));
      if (controller.signal.aborted) return [];
      const features = [];
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') features.push(...result.value);
        else if (result.reason?.name !== 'AbortError') {
          errors.push(`${jobs[index].overlay.name || jobs[index].overlay.id}: ${result.reason.message}`);
        }
      });
      if (errors.length) notify(`Could not query ArcGIS layer${errors.length > 1 ? 's' : ''}: ${errors.join('; ')}`);
      return features;
    } finally {
      if (activeController === controller) activeController = null;
    }
  };

  return { query, cancel };
}
