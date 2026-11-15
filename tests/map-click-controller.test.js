import assert from 'node:assert/strict';
import test from 'node:test';
import { createMapClickController } from '../js/map-click-controller.js';

function dependencies(overrides = {}) {
  return {
    map: {},
    document: {},
    maplibregl: { Popup: class {} },
    queryData: () => [],
    around: point => point,
    arcgisClickEnvelope: point => point,
    queryArcgisOverlays: async () => [],
    withLinked: async features => features,
    getJsonThemeConfig: () => null,
    getJsonThemeState: () => ({ featureById: new Map() }),
    isNotificationPicking: () => false,
    selectNotificationLocation: () => {},
    isBoxMode: () => false,
    isJustBoxed: () => false,
    datasetGeometryLayerIds: () => [],
    showJsonThemePopup: () => null,
    appendArcgisFeaturesToJsonThemePopup: () => {},
    escapeHtml: String,
    renderCell: String,
    ...overrides
  };
}

test('notification picking and box mode bypass map feature queries', async () => {
  let queries = 0;
  let selectedLocation;
  const event = { point: { x: 1, y: 2 }, lngLat: { lng: -6, lat: 54 } };
  const notificationController = createMapClickController(dependencies({
    queryData: () => { queries++; return []; },
    isNotificationPicking: () => true,
    selectNotificationLocation: location => { selectedLocation = location; }
  }));
  await notificationController.handleClick(event);

  const boxController = createMapClickController(dependencies({
    queryData: () => { queries++; return []; },
    isBoxMode: () => true
  }));
  await boxController.handleClick(event);

  assert.deepEqual(selectedLocation, event.lngLat);
  assert.equal(queries, 0);
});

test('stale click-query results are discarded', async () => {
  const pending = [];
  let popups = 0;
  const controller = createMapClickController(dependencies({
    queryArcgisOverlays: () => new Promise(resolve => pending.push(resolve)),
    maplibregl: {
      Popup: class {
        setLngLat() { return this; }
        setDOMContent() { return this; }
        addTo() { popups++; return this; }
      }
    }
  }));
  const event = { point: { x: 1, y: 2 }, lngLat: { lng: -6, lat: 54 } };
  const first = controller.handleClick(event);
  const second = controller.handleClick(event);
  pending[0]([{ layer: { id: 'old' }, sourceLayer: 'Old', properties: { id: 1 } }]);
  pending[1]([]);
  await Promise.all([first, second]);

  assert.equal(popups, 0);
});

test('geometry-dataset clicks append ArcGIS results to the JSON theme popup', async () => {
  const feature = {
    layer: { id: 'sites' },
    properties: { site_id: 'site-1' }
  };
  const popupContent = {};
  const arcgisFeatures = [{ sourceLayer: 'Reports', layer: { id: 'reports' }, properties: { title: 'Report' } }];
  const appended = [];
  let queriedEnvelope;
  const controller = createMapClickController(dependencies({
    queryData: () => [feature],
    arcgisClickEnvelope: point => { queriedEnvelope = point; return 'envelope'; },
    queryArcgisOverlays: async geometry => {
      assert.equal(geometry, 'envelope');
      return arcgisFeatures;
    },
    getJsonThemeConfig: () => ({
      geometryDataset: true,
      geometryLinkField: 'site_id',
      linkField: 'site_id'
    }),
    getJsonThemeState: () => ({ featureById: new Map([['site-1', feature]]) }),
    datasetGeometryLayerIds: () => ['sites'],
    showJsonThemePopup: () => popupContent,
    appendArcgisFeaturesToJsonThemePopup: (content, results) => appended.push([content, results])
  }));
  const event = { point: { x: 5, y: 8 }, lngLat: { lng: -6, lat: 54 } };
  await controller.handleClick(event);

  assert.deepEqual(queriedEnvelope, event.point);
  assert.deepEqual(appended, [[popupContent, arcgisFeatures]]);
});
