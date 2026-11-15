import assert from 'node:assert/strict';
import test from 'node:test';
import { createCogContourSourceController, decodeContourDemPixels } from '../js/cog-contour-source.js';

function encodedPixel(value, alpha = 255) {
  return [value >> 16, (value >> 8) & 255, value & 255, alpha];
}

test('contour DEM pixel decoding preserves elevations and marks no-data pixels', () => {
  const pixels = new Uint8ClampedArray([
    ...encodedPixel(100010),
    ...encodedPixel(100000),
    ...encodedPixel(100020, 128)
  ]);
  const decoded = decodeContourDemPixels(pixels, 3, 1);

  assert.equal(decoded.width, 3);
  assert.equal(decoded.height, 1);
  assert.equal(decoded.data[0], 1);
  assert.ok(Number.isNaN(decoded.data[1]));
  assert.ok(Number.isNaN(decoded.data[2]));
});

test('contour DEM sources are cached and adapt COG tiles for MapLibre', async () => {
  const bitmap = { width: 1, height: 1, close() {} };
  const setupMap = {};
  let created = 0, fetchedTile;
  class DemSource {
    constructor(options) {
      created++;
      this.options = options;
      this.manager = {};
    }
    setupMaplibre(maplibregl) {
      this.maplibregl = maplibregl;
    }
  }
  const controller = createCogContourSourceController({
    maplibregl: setupMap,
    contourLibrary: () => ({ DemSource }),
    getCogProtocol: () => async request => {
      fetchedTile = request;
      return { data: bitmap };
    },
    createCanvas: () => ({
      getContext: () => ({
        drawImage: () => {},
        getImageData: () => ({ data: new Uint8ClampedArray(encodedPixel(100010)) })
      })
    })
  });
  const first = controller.getSource('https://example.test/dem.tif', 12);
  const second = controller.getSource('https://example.test/dem.tif', 14);
  const tile = await first.manager.getTile('tile-url', { signal: { aborted: false } });
  const decoded = await first.manager.decodeImage(bitmap);

  assert.equal(created, 1);
  assert.equal(first, second);
  assert.equal(first.maplibregl, setupMap);
  assert.equal(first.options.maxzoom, 12);
  assert.deepEqual(fetchedTile, { url: 'tile-url', type: 'image' });
  assert.equal(tile.data, bitmap);
  assert.equal(decoded.data[0], 1);
  await assert.rejects(first.manager.getTile('tile-url', { signal: { aborted: true } }), { name: 'AbortError' });
});
