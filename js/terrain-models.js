export function normalizeTerrainModels(terrain = {}, warn = (...args) => console.warn(...args)) {
  const configured = Array.isArray(terrain.models) && terrain.models.length ? terrain.models : terrain.cog
    ? [{
      id: 'default',
      name: terrain.modelName || terrain.hillshadeName || 'DTM',
      cog: terrain.cog,
      tileSize: terrain.tileSize,
      attribution: terrain.attribution
    }]
    : [];
  const ids = new Set();
  const models = [];
  configured.forEach((model, index) => {
    if (!model || typeof model.cog !== 'string' || !model.cog.trim()) {
      warn('Terrain model skipped: needs a COG path', model);
      return;
    }
    const id = String(model.id || `model-${index + 1}`);
    if (ids.has(id)) {
      warn('Terrain model skipped: duplicate id', id);
      return;
    }
    ids.add(id);
    models.push({
      ...model,
      id,
      name: model.name || id,
      sourceId: `dtm-terrain-${models.length}`,
      hillshadeSourceId: `dtm-hillshade-${models.length}`
    });
  });
  return models;
}

export function createTerrainRangeValidator({ fetchImpl = fetch, baseUrl = globalThis.location?.href } = {}) {
  const checks = new Map();
  const verified = new Set();

  function verify(model) {
    const url = new URL(model.cog, baseUrl).href;
    if (!checks.has(url)) {
      let tracked;
      const pending = (async () => {
        const controller = new AbortController();
        try {
          const response = await fetchImpl(url, {
            headers: { Range: 'bytes=0-0' },
            signal: controller.signal
          });
          if (response.status !== 206) {
            controller.abort();
            throw new Error(`The server ignored byte-range requests (HTTP ${response.status}); refusing to download the full DEM.`);
          }
          await response.body?.cancel();
          verified.add(url);
        } catch (error) {
          controller.abort();
          throw error;
        }
      })();
      tracked = pending.catch(error => {
        if (checks.get(url) === tracked) checks.delete(url);
        throw error;
      });
      checks.set(url, tracked);
    }
    return checks.get(url);
  }

  return { verify, verified };
}
