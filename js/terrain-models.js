import { createRangeRequestValidator } from './range-request-validator.js';

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
  const validator = createRangeRequestValidator({ fetchImpl, baseUrl, resourceName: 'DEM' });
  return {
    verify: model => validator.verify(model.cog),
    verified: validator.verified
  };
}
