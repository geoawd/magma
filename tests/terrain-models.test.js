import assert from 'node:assert/strict';
import test from 'node:test';
import { createRangeRequestValidator } from '../js/range-request-validator.js';
import { createTerrainRangeValidator, normalizeTerrainModels } from '../js/terrain-models.js';

test('shared range validator accepts direct URLs and names the requested resource', async () => {
  let fetchCount = 0;
  const validator = createRangeRequestValidator({
    baseUrl: 'https://example.test/map/',
    resourceName: 'COG file',
    fetchImpl: async (url, options) => {
      fetchCount++;
      assert.equal(url, 'https://example.test/map/raster.tif');
      assert.equal(options.headers.Range, 'bytes=0-0');
      return { status: 200 };
    }
  });

  await assert.rejects(validator.verify('raster.tif'), /refusing to download the full COG file/);
  assert.equal(fetchCount, 1);
});

test('terrain models normalize legacy config and skip invalid or duplicate entries', () => {
  const warnings = [];
  const models = normalizeTerrainModels({
    models: [
      { id: 'dtm', cog: 'data/dtm.tif' },
      { id: 'dtm', cog: 'data/duplicate.tif' },
      { id: 'missing-path' },
      { cog: 'data/dsm.tif', name: 'DSM' }
    ]
  }, (...args) => warnings.push(args));

  assert.deepEqual(models.map(model => [
    model.id, model.name, model.sourceId, model.hillshadeSourceId
  ]), [
    ['dtm', 'dtm', 'dtm-terrain-0', 'dtm-hillshade-0'],
    ['model-4', 'DSM', 'dtm-terrain-1', 'dtm-hillshade-1']
  ]);
  assert.equal(warnings.length, 2);

  assert.deepEqual(normalizeTerrainModels({
    cog: 'legacy.tif', modelName: 'Legacy DEM', tileSize: 512
  })[0], {
    id: 'default',
    name: 'Legacy DEM',
    cog: 'legacy.tif',
    tileSize: 512,
    attribution: undefined,
    sourceId: 'dtm-terrain-0',
    hillshadeSourceId: 'dtm-hillshade-0'
  });
});

test('terrain range checks share in-flight requests and cancel response bodies', async () => {
  let fetchCount = 0;
  let rangeHeader;
  let bodyCancelled = false;
  const validator = createTerrainRangeValidator({
    baseUrl: 'https://example.test/map/',
    fetchImpl: async (url, options) => {
      fetchCount++;
      rangeHeader = options.headers.Range;
      assert.equal(url, 'https://example.test/map/dtm.tif');
      return {
        status: 206,
        body: { cancel: async () => { bodyCancelled = true; } }
      };
    }
  });
  const model = { cog: 'dtm.tif' };
  await Promise.all([validator.verify(model), validator.verify(model)]);

  assert.equal(fetchCount, 1);
  assert.equal(rangeHeader, 'bytes=0-0');
  assert.equal(bodyCancelled, true);
  assert.deepEqual([...validator.verified], ['https://example.test/map/dtm.tif']);
});

test('terrain range validation reports ignored ranges and allows a retry', async () => {
  let fetchCount = 0;
  const validator = createTerrainRangeValidator({
    baseUrl: 'https://example.test/',
    fetchImpl: async () => ({ status: ++fetchCount === 1 ? 200 : 206 })
  });
  const model = { cog: 'dem.tif' };

  await assert.rejects(validator.verify(model), /ignored byte-range requests \(HTTP 200\)/);
  await validator.verify(model);
  assert.equal(fetchCount, 2);
});
