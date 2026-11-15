import assert from 'node:assert/strict';
import test from 'node:test';
import { createMapFeatureQueryController } from '../js/map-feature-query.js';

test('queries vector and GeoJSON layers once and labels GeoJSON features', () => {
  const queried = [];
  const features = [
    { source: 'vector', id: 1, layer: { id: 'roads' }, properties: { name: 'A' } },
    { source: 'vector', id: 1, layer: { id: 'roads' }, properties: { name: 'A' } },
    { source: 'geojson', id: 2, layer: { id: 'districts' }, properties: { name: 'B' } }
  ];
  const config = {
    overlays: [{ id: 'districts', name: 'Districts', geojson: true }],
    queryLayers: null
  };
  const map = {
    getLayer: id => id === 'districts',
    getStyle: () => ({
      layers: [{ id: 'roads', source: 'vector-source' }, { id: 'labels', source: 'raster-source' }],
      sources: { 'vector-source': { type: 'vector' }, 'raster-source': { type: 'raster' } }
    }),
    queryRenderedFeatures: (geometry, options) => {
      queried.push({ geometry, layers: options.layers });
      return features;
    }
  };
  const queries = createMapFeatureQueryController({ map, getConfig: () => config });
  const results = queries.queryData([[0, 0], [10, 10]]);

  assert.deepEqual(queried[0].layers, ['roads', 'districts']);
  assert.equal(results.length, 2);
  assert.equal(results[1].sourceLayer, 'Districts');
});

test('builds screen geometries and geographic ArcGIS geometries', () => {
  const map = {
    getCanvas: () => ({ clientWidth: 800, clientHeight: 600 }),
    unproject: ([x, y]) => ({ lng: x / 10, lat: y / 10 })
  };
  const queries = createMapFeatureQueryController({ map, getConfig: () => ({}) });

  assert.deepEqual(queries.around({ x: 10, y: 20 }), [[5, 15], [15, 25]]);
  assert.deepEqual(queries.wholeMap(), [[0, 0], [800, 600]]);
  assert.deepEqual(queries.arcgisClickEnvelope({ x: 10, y: 20 }), {
    xmin: 0.5, ymin: 1.5, xmax: 1.5, ymax: 2.5
  });
  assert.deepEqual(queries.arcgisBoxPolygon({ x: 20, y: 40 }, { x: 10, y: 30 }), {
    rings: [[[1, 3], [2, 3], [2, 4], [1, 4], [1, 3]]]
  });
});

test('joins linked features once per parent ID and caches the source index', async () => {
  let fetchCount = 0;
  const config = {
    dataLinks: {
      Boreholes: {
        field: 'borehole_id',
        links: [{ label: 'Samples', file: '/samples.json', dataKey: 'records' }]
      }
    }
  };
  const map = {};
  const queries = createMapFeatureQueryController({
    map,
    getConfig: () => config,
    fetchImpl: async () => {
      fetchCount++;
      return {
        ok: true,
        json: async () => ({ records: [
          { borehole_id: 'a', result: 1 },
          { borehole_id: 'a', result: 2 },
          { borehole_id: 'b', result: 3 }
        ] })
      };
    }
  });
  const parentA = {
    sourceLayer: 'Boreholes',
    geometry: { type: 'Point' },
    properties: { borehole_id: 'a' }
  };
  const parentADuplicate = { ...parentA };
  const parentB = {
    sourceLayer: 'Boreholes',
    geometry: { type: 'Point' },
    properties: { borehole_id: 'b' }
  };

  const first = await queries.withLinked([parentA, parentADuplicate, parentB]);
  const second = await queries.withLinked([parentA]);

  assert.equal(fetchCount, 1);
  assert.deepEqual(first.slice(0, 3), [parentA, parentADuplicate, parentB]);
  assert.deepEqual(first.slice(3).map(feature => feature.properties.result), [1, 2, 3]);
  assert.equal(first[3].parent, parentA);
  assert.equal(first[3].geometry, parentA.geometry);
  assert.deepEqual(second.slice(1).map(feature => feature.properties.result), [1, 2]);
});
