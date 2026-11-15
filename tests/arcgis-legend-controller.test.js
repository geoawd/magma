import assert from 'node:assert/strict';
import test from 'node:test';
import { createArcgisLegendController } from '../js/arcgis-legend-controller.js';

test('ArcGIS legend request targets configured MapServer sublayers', () => {
  const controller = createArcgisLegendController({
    map: {},
    document: {},
    getOverlays: () => [],
    baseUrl: 'https://example.test/'
  });
  const request = controller.request({
    url: 'https://maps.example.test/arcgis/rest/services/Geology/MapServer/',
    layers: 'show:0, 3'
  });

  assert.equal(request.url, 'https://maps.example.test/arcgis/rest/services/Geology/MapServer/legend?f=json');
  assert.deepEqual([...request.layerIds], ['0', '3']);
  assert.equal(controller.request({ url: 'https://example.test/wms' }), null);
});

test('visible ArcGIS overlays are filtered with identify requests for the current map extent', async () => {
  const requests = [];
  const controller = createArcgisLegendController({
    map: {
      getStyle: () => ({}),
      getLayer: id => id === 'overlay',
      getLayoutProperty: () => 'visible',
      getBounds: () => ({
        getWest: () => -8,
        getSouth: () => 53,
        getEast: () => -5,
        getNorth: () => 56
      }),
      getCanvas: () => ({ clientWidth: 800, clientHeight: 600 })
    },
    document: {},
    getOverlays: () => [{
      id: 'overlay',
      url: 'https://maps.example.test/arcgis/rest/services/Geology/MapServer/',
      layers: '0,1'
    }],
    baseUrl: 'https://example.test/',
    fetchImpl: async url => {
      const requestUrl = new URL(url);
      requests.push(requestUrl);
      return {
        ok: true,
        json: async () => requestUrl.pathname.endsWith('/identify')
          ? { results: [{ layerId: 0, value: 'Bedrock' }] }
          : { capabilities: 'Map,Query' }
      };
    }
  });

  await controller.updateInView();

  const identify = requests.find(url => url.pathname.endsWith('/identify'));
  assert.ok(identify);
  assert.equal(identify.searchParams.get('layers'), 'visible:0,1');
  assert.equal(identify.searchParams.get('geometryType'), 'esriGeometryEnvelope');
  assert.equal(identify.searchParams.get('mapExtent'), '-8,53,-5,56');
  assert.equal(identify.searchParams.get('imageDisplay'), '800,600,96');
});
