(function () {
  const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const fail = (path, reason) => { throw new Error(`Invalid CONFIG.${path}: ${reason}.`); };
  const requireRecord = (value, path) => {
    if (!isRecord(value)) fail(path, 'must be an object');
  };
  const requireName = (value, path) => {
    if (typeof value !== 'string' || !value.trim()) fail(path, 'must be a non-empty string');
  };
  const requireStringArray = (value, path) => {
    if (value !== undefined && (!Array.isArray(value) || value.some(item =>
      typeof item !== 'string' || !item.trim()))) {
      fail(path, 'must be an array of non-empty strings');
    }
  };
  const requireUniqueIds = (items, path) => {
    const ids = new Set();
    items.forEach((item, index) => {
      requireRecord(item, `${path}[${index}]`);
      requireName(item.id, `${path}[${index}].id`);
      if (ids.has(item.id)) fail(`${path}[${index}].id`, `duplicates "${item.id}"`);
      ids.add(item.id);
    });
    return ids;
  };

  window.validateAppConfig = config => {
    requireRecord(config, 'root');
    requireName(config.title, 'title');

    const datasets = config.datasets || [];
    const basemaps = config.basemaps || [];
    const overlays = config.overlays || [];
    const themes = config.themes || [];
    for (const [items, path] of [[datasets, 'datasets'], [basemaps, 'basemaps'], [overlays, 'overlays'], [themes, 'themes']]) {
      if (!Array.isArray(items)) fail(path, 'must be an array');
    }

    const datasetIds = requireUniqueIds(datasets, 'datasets');
    const overlayIds = requireUniqueIds(overlays, 'overlays');
    requireUniqueIds(basemaps, 'basemaps');

    if (config.cogProjections !== undefined) {
      if (!Array.isArray(config.cogProjections)) fail('cogProjections', 'must be an array');
      const projectionCodes = new Set();
      config.cogProjections.forEach((projection, index) => {
        requireRecord(projection, `cogProjections[${index}]`);
        if (!Number.isInteger(projection.code) || projection.code <= 0) {
          fail(`cogProjections[${index}].code`, 'must be a positive integer');
        }
        if (projectionCodes.has(projection.code)) {
          fail(`cogProjections[${index}].code`, `duplicates "${projection.code}"`);
        }
        projectionCodes.add(projection.code);
        requireName(projection.definition, `cogProjections[${index}].definition`);
      });
    }

    datasets.forEach((dataset, index) => {
      if (dataset.style !== undefined) requireName(dataset.style, `datasets[${index}].style`);
      if (dataset.pmtiles !== undefined) requireName(dataset.pmtiles, `datasets[${index}].pmtiles`);
    });
    basemaps.forEach((basemap, index) => {
      requireName(basemap.tiles, `basemaps[${index}].tiles`);
    });
    overlays.forEach((overlay, index) => {
      const sourceFields = ['url', 'tiles', 'cog'].filter(field => overlay[field] !== undefined);
      if (sourceFields.length !== 1) fail(`overlays[${index}]`, 'must define exactly one of url, tiles, or cog');
      requireName(overlay[sourceFields[0]], `overlays[${index}].${sourceFields[0]}`);
      if (overlay.opacity !== undefined &&
          (!Number.isFinite(overlay.opacity) || overlay.opacity < 0 || overlay.opacity > 1)) {
        fail(`overlays[${index}].opacity`, 'must be between 0 and 1');
      }
    });

    themes.forEach((theme, index) => {
      requireRecord(theme, `themes[${index}]`);
      requireName(theme.name, `themes[${index}].name`);
      for (const key of ['layers', 'datasets', 'overlays', 'groups']) {
        requireStringArray(theme[key], `themes[${index}].${key}`);
      }
      (theme.datasets || []).forEach(id => {
        if (!datasetIds.has(id)) fail(`themes[${index}].datasets`, `references unknown dataset "${id}"`);
      });
      (theme.overlays || []).forEach(id => {
        const groupExists = overlays.some(overlay => overlay.group === id);
        if (!overlayIds.has(id) && !groupExists) fail(`themes[${index}].overlays`, `references unknown overlay or group "${id}"`);
      });
    });
    if (config.defaultTheme !== undefined &&
        (!Number.isInteger(config.defaultTheme) || config.defaultTheme < 0 || config.defaultTheme >= themes.length)) {
      fail('defaultTheme', 'must be an index of a configured theme');
    }
    if (config.center !== undefined &&
        (!Array.isArray(config.center) || config.center.length !== 2 || !config.center.every(Number.isFinite))) {
      fail('center', 'must contain two finite coordinates');
    }
    if (config.zoom !== undefined && (!Number.isFinite(config.zoom) || config.zoom < 0 || config.zoom > 28)) {
      fail('zoom', 'must be between 0 and 28');
    }
    if (config.terrain !== undefined) {
      requireRecord(config.terrain, 'terrain');
      const models = config.terrain.models || [];
      if (!Array.isArray(models)) fail('terrain.models', 'must be an array');
      const modelIds = requireUniqueIds(models, 'terrain.models');
      models.forEach((model, index) => requireName(model.cog, `terrain.models[${index}].cog`));
      if (config.terrain.defaultModel !== undefined && !modelIds.has(config.terrain.defaultModel)) {
        fail('terrain.defaultModel', `references unknown terrain model "${config.terrain.defaultModel}"`);
      }
    }
    return config;
  };
})();
