import assert from 'node:assert/strict';
import test from 'node:test';
import {
  arcgisLayerIds,
  buildArcgisQueryUrl,
  parseArcgisQueryResponse
} from '../js/arcgis-query.js';

test('ArcGIS query URL targets the layer and requests attributes intersecting the click envelope', () => {
  const url = new URL(buildArcgisQueryUrl(
    'https://example.org/arcgis/rest/services/test/MapServer/',
    '0',
    { xmin: -6, ymin: 54, xmax: -5, ymax: 55 }
  ));
  assert.equal(url.pathname, '/arcgis/rest/services/test/MapServer/0/query');
  assert.deepEqual(JSON.parse(url.searchParams.get('geometry')), {
    xmin: -6,
    ymin: 54,
    xmax: -5,
    ymax: 55,
    spatialReference: { wkid: 4326 }
  });
  assert.equal(url.searchParams.get('geometryType'), 'esriGeometryEnvelope');
  assert.equal(url.searchParams.get('inSR'), '4326');
  assert.equal(url.searchParams.get('spatialRel'), 'esriSpatialRelIntersects');
  assert.equal(url.searchParams.get('outFields'), '*');
  assert.equal(url.searchParams.get('returnGeometry'), 'false');
  assert.equal(url.searchParams.get('f'), 'json');
});

test('ArcGIS query supports configured IDs and a layer ID embedded in the service URL', () => {
  assert.deepEqual(arcgisLayerIds('show:0, 2', 'https://example.org/MapServer/'), ['0', '2']);
  assert.deepEqual(arcgisLayerIds(undefined, 'https://example.org/MapServer/3'), ['3']);
  assert.throws(() => arcgisLayerIds('all', 'https://example.org/MapServer/'), /Invalid ArcGIS layer IDs/);
});

test('ArcGIS query response returns feature attributes and surfaces service errors', () => {
  assert.deepEqual(parseArcgisQueryResponse({
    features: [{ attributes: { REPORT: 'Borehole report', OBJECTID: 8 } }]
  }), [{ REPORT: 'Borehole report', OBJECTID: 8 }]);
  assert.throws(() => parseArcgisQueryResponse({ error: { code: 400, message: 'Bad query' } }),
    /code 400: Bad query/);
  assert.throws(() => parseArcgisQueryResponse({}), /expected a features array/);
  assert.throws(() => parseArcgisQueryResponse({ features: [{}] }), /missing attributes/);
  assert.throws(() => parseArcgisQueryResponse({ features: [], exceededTransferLimit: true }),
    /exceeded the service record limit/);
});

test('ArcGIS query rejects invalid service URLs and envelopes', () => {
  assert.throws(() => buildArcgisQueryUrl('https://example.org/tiles/', '0', {
    xmin: 0, ymin: 0, xmax: 1, ymax: 1
  }), /Not an ArcGIS MapServer URL/);
  assert.throws(() => buildArcgisQueryUrl('https://example.org/MapServer/', 'x', {
    xmin: 0, ymin: 0, xmax: 1, ymax: 1
  }), /Invalid ArcGIS layer ID/);
  assert.throws(() => buildArcgisQueryUrl('https://example.org/MapServer/', '0', {
    xmin: 2, ymin: 0, xmax: 1, ymax: 1
  }), /Invalid ArcGIS query envelope/);
});
